import Foundation

/// Reads the Supabase auth payload from an App Groups file, written by the main
/// app's useAuthTokenSync hook on every Supabase auth state change.
///
/// Returns nil when:
/// - User is signed out (no file, or file with null access_token)
/// - File is unreadable / malformed
///
/// Does NOT check JWT expiry - an expired token just produces a 401 from
/// Supabase, which MarkEpisodeWatchedIntent treats as silent failure per Q2.
///
/// Uses App Groups (not Keychain Sharing) because the Keychain Sharing
/// entitlement requires Apple Developer Portal configuration that broke
/// the main app's auth when we tried it. See the Phase 2 plan ADR.
enum AuthTokenReader {
    private struct Payload: Codable {
        let accessToken: String?
        let userId: String?

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case userId = "user_id"
        }
    }

    /// Returns the raw JWT access token if the user is signed in; nil otherwise.
    static func read() -> String? {
        guard let payload = readPayload(),
              let token = payload.accessToken, !token.isEmpty else {
            return nil
        }
        return token
    }

    /// Returns the signed-in user's ID (the Supabase `auth.users.id` UUID) if
    /// available. Needed for the user_episode_watches INSERT payload.
    static func readUserId() -> String? {
        guard let payload = readPayload(),
              let userId = payload.userId, !userId.isEmpty else {
            return nil
        }
        return userId
    }

    private static func readPayload() -> Payload? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.identifier) else {
            return nil
        }
        let url = container
            .appendingPathComponent(AppGroup.authSubdir)
            .appendingPathComponent(AppGroup.authTokenFilename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Payload.self, from: data)
    }
}
