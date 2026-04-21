import Foundation

/// Widget-side Supabase REST client. Minimal URLSession wrapper.
/// Auth via App Groups file written by the main app's useAuthTokenSync hook;
/// no supabase-swift SDK dependency.
///
/// markEpisodeWatched calls the mark_episode_watched RPC which atomically
/// inserts the watch record and recomputes current_season / current_episode
/// in a single round-trip.
struct SupabaseWidgetClient {
    enum ClientError: Error {
        case missingConfig
        case missingToken
        case missingUserId
        case httpError(Int, String?)
        case invalidResponse
    }

    /// Marks the next episode as watched via the mark_episode_watched RPC.
    /// The RPC atomically inserts the watch record and recomputes
    /// current_season / current_episode in a single round-trip.
    /// When totalEpisodesInSeason > 0 and the show is Ended/Canceled and
    /// the user has reached the final episode of the final season, the
    /// RPC also auto-flips status='watched' on user_tv_shows.
    /// - Parameters:
    ///   - userTvShowId: the user_tv_shows.id UUID
    ///   - tmdbShowId: the TMDB show ID
    ///   - seasonNumber: the season containing the episode to mark
    ///   - episodeNumber: the episode number to mark
    ///   - totalEpisodesInSeason: total episodes in the current season
    ///     from TMDB. Pass 0 when unknown — the RPC then skips the
    ///     auto-flip branch and defers to a later call with a known value.
    static func markEpisodeWatched(
        userTvShowId: String,
        tmdbShowId: Int,
        seasonNumber: Int,
        episodeNumber: Int,
        totalEpisodesInSeason: Int
    ) async throws {
        let config = try resolveConfig()
        guard let endpoint = URL(string: "\(config.url)/rest/v1/rpc/mark_episode_watched") else {
            throw ClientError.missingConfig
        }

        let body: [String: Any] = [
            "p_user_tv_show_id": userTvShowId,
            "p_tmdb_show_id": tmdbShowId,
            "p_season_number": seasonNumber,
            "p_episode_number": episodeNumber,
            "p_total_episodes_in_season": totalEpisodesInSeason,
        ]

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.addValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
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
