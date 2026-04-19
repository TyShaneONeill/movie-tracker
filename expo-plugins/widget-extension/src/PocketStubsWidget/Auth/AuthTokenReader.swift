import Foundation

/// Reads the Supabase auth payload + config from an App Groups file, written
/// by the main app's useAuthTokenSync hook on every auth state change.
///
/// Includes:
/// - access_token / user_id (nullable — null when signed out)
/// - supabase_url / supabase_anon_key (always present)
///
/// Token fields return nil when user is signed out or file is unreadable;
/// SupabaseWidgetClient treats that as silent failure per design Q2.
///
/// Uses App Groups (not Keychain Sharing) because Keychain Sharing required
/// Apple Developer Portal configuration that broke the main app's auth.
/// Supabase URL + anon key also live here because @bacons/apple-targets'
/// infoPlist block doesn't reliably propagate env vars into the widget's
/// Info.plist - App Groups is the one mechanism that works.
enum AuthTokenReader {
    private struct Payload: Codable {
        let accessToken: String?
        let userId: String?
        let supabaseUrl: String
        let supabaseAnonKey: String

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case userId = "user_id"
            case supabaseUrl = "supabase_url"
            case supabaseAnonKey = "supabase_anon_key"
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

    /// Returns (Supabase URL, Supabase anon key) if readable; nil otherwise.
    static func readSupabaseConfig() -> (url: String, anonKey: String)? {
        guard let payload = readPayload(),
              !payload.supabaseUrl.isEmpty,
              !payload.supabaseAnonKey.isEmpty else {
            return nil
        }
        return (payload.supabaseUrl, payload.supabaseAnonKey)
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
