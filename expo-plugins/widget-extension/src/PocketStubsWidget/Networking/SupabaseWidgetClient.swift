import Foundation

/// Widget-side Supabase REST client. Minimal URLSession wrapper.
/// Auth via App Groups file written by the main app's useAuthTokenSync hook;
/// no supabase-swift SDK dependency.
///
/// Both user actions (mark episode watched, advance season) are implemented
/// as the same two-call pattern that the main app's tv-show-service uses:
/// 1. INSERT a row into user_episode_watches
/// 2. RPC sync_tv_show_progress to recompute current_season / current_episode
struct SupabaseWidgetClient {
    enum ClientError: Error {
        case missingConfig
        case missingToken
        case missingUserId
        case httpError(Int, String?)
        case invalidResponse
    }

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// Marks the next episode as watched.
    /// - Parameters:
    ///   - userTvShowId: the user_tv_shows.id UUID
    ///   - tmdbShowId: the TMDB show ID (for user_episode_watches.tmdb_show_id)
    ///   - seasonNumber: the season containing the episode to mark
    ///   - episodeNumber: the episode number to mark
    static func markEpisodeWatched(
        userTvShowId: String,
        tmdbShowId: Int,
        seasonNumber: Int,
        episodeNumber: Int
    ) async throws {
        try await insertEpisodeWatch(
            userTvShowId: userTvShowId,
            tmdbShowId: tmdbShowId,
            seasonNumber: seasonNumber,
            episodeNumber: episodeNumber
        )
        try await syncProgress(userTvShowId: userTvShowId)
    }

    private static func insertEpisodeWatch(
        userTvShowId: String,
        tmdbShowId: Int,
        seasonNumber: Int,
        episodeNumber: Int
    ) async throws {
        let config = try resolveConfig()
        guard let endpoint = URL(string: "\(config.url)/rest/v1/user_episode_watches") else {
            throw ClientError.missingConfig
        }

        // Column names MUST match the actual user_episode_watches schema.
        // Mirror lib/tv-show-service.ts markEpisodeWatched INSERT body.
        // watched_at is explicit so the optimistic widget patch timestamp
        // matches what the main app will see on next reconciliation.
        let body: [String: Any] = [
            "user_id": config.userId,
            "user_tv_show_id": userTvShowId,
            "tmdb_show_id": tmdbShowId,
            "season_number": seasonNumber,
            "episode_number": episodeNumber,
            "watched_at": Self.iso8601Formatter.string(from: Date()),
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        // return=minimal - save bandwidth (don't return inserted row).
        // resolution=ignore-duplicates - rapid widget taps or Shortcuts-driven
        // double-fire post duplicate rows that the unique index would otherwise
        // 409 on; with this header PostgREST silently no-ops duplicates.
        request.addValue("return=minimal,resolution=ignore-duplicates", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    private static func syncProgress(userTvShowId: String) async throws {
        let config = try resolveConfig()
        guard let endpoint = URL(string: "\(config.url)/rest/v1/rpc/sync_tv_show_progress") else {
            throw ClientError.missingConfig
        }

        let body: [String: Any] = ["p_user_tv_show_id": userTvShowId]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // sync_tv_show_progress is idempotent (recomputes from user_episode_watches).
        // One retry after 500ms covers transient network drops. 4xx skip retry.
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            try validate(response: response, data: data)
        } catch ClientError.httpError(let status, let body) where status < 500 {
            throw ClientError.httpError(status, body)
        } catch {
            try? await Task.sleep(nanoseconds: 500_000_000)
            let (data, response) = try await URLSession.shared.data(for: request)
            try validate(response: response, data: data)
        }
    }

    /// Resolves (Supabase URL, anon key, JWT, user ID) from the App Groups
    /// auth file. Single-parse via AuthTokenReader.readAll().
    private static func resolveConfig() throws -> (url: String, anonKey: String, token: String, userId: String) {
        guard let snapshot = AuthTokenReader.readAll() else {
            throw ClientError.missingConfig
        }
        guard let token = snapshot.accessToken, !token.isEmpty else {
            throw ClientError.missingToken
        }
        guard let userId = snapshot.userId, !userId.isEmpty else {
            throw ClientError.missingUserId
        }
        return (snapshot.supabaseUrl, snapshot.supabaseAnonKey, token, userId)
    }

    private static func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8)
            throw ClientError.httpError(http.statusCode, body)
        }
    }
}
