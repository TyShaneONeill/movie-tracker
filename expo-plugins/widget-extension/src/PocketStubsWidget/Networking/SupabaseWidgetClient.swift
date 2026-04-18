import Foundation

/// Widget-side Supabase REST client. Minimal URLSession wrapper.
/// Auth via shared Keychain; no supabase-swift SDK dependency.
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
        guard let (baseUrl, anonKey, token) = try? resolveConfig() else {
            throw ClientError.missingConfig
        }
        guard let userId = KeychainTokenReader.readUserId() else {
            throw ClientError.missingUserId
        }
        guard let endpoint = URL(string: "\(baseUrl)/rest/v1/user_episode_watches") else {
            throw ClientError.missingConfig
        }

        // Column names MUST match the actual user_episode_watches schema.
        // Mirror lib/tv-show-service.ts markEpisodeWatched INSERT body.
        // Note: main app also sets episode_name, episode_runtime, still_path,
        // and watched_at. The widget lacks episode metadata at tap time, so
        // those columns are omitted - they're all nullable in the schema.
        // watched_at defaults to now() via the column default (or remains null;
        // the main app's syncWidgetCache reconciles on next foreground).
        let body: [String: Any] = [
            "user_id": userId,
            "user_tv_show_id": userTvShowId,
            "tmdb_show_id": tmdbShowId,
            "season_number": seasonNumber,
            "episode_number": episodeNumber,
            "watched_at": ISO8601DateFormatter().string(from: Date()),
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        // PostgREST returns the inserted row when Prefer: return=representation,
        // but we don't need it - save bandwidth.
        request.addValue("return=minimal", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    private static func syncProgress(userTvShowId: String) async throws {
        guard let (baseUrl, anonKey, token) = try? resolveConfig() else {
            throw ClientError.missingConfig
        }
        guard let endpoint = URL(string: "\(baseUrl)/rest/v1/rpc/sync_tv_show_progress") else {
            throw ClientError.missingConfig
        }

        let body: [String: Any] = ["p_user_tv_show_id": userTvShowId]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
    }

    /// Resolves (Supabase URL, anon key, JWT) from Info.plist + Keychain.
    /// Throws `.missingConfig` if any piece is absent.
    private static func resolveConfig() throws -> (String, String, String) {
        guard let url = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
              !url.isEmpty else {
            throw ClientError.missingConfig
        }
        guard let anonKey = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
              !anonKey.isEmpty else {
            throw ClientError.missingConfig
        }
        guard let token = KeychainTokenReader.read() else {
            throw ClientError.missingToken
        }
        return (url, anonKey, token)
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
