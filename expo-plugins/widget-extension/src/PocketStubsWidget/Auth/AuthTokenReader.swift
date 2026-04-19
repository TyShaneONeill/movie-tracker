import Foundation

/// Reads the Supabase auth payload + config from an App Groups file, written
/// by the main app's useAuthTokenSync hook on every auth state change.
///
/// The payload contains:
/// - access_token / user_id (nullable — null when signed out)
/// - supabase_url / supabase_anon_key (always present)
///
/// Each single-field accessor (`read()`, `readUserId()`, `readSupabaseConfig()`)
/// re-reads and re-parses the file. `readAll()` returns everything in a single
/// parse for callers that need multiple fields - avoids re-parsing the same
/// JSON on every intent execution.
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

    /// Bundle of all readable values from the auth file, in one parse.
    struct Snapshot {
        let accessToken: String?
        let userId: String?
        let supabaseUrl: String
        let supabaseAnonKey: String
    }

    static func read() -> String? {
        guard let payload = readPayload(),
              let token = payload.accessToken, !token.isEmpty else {
            return nil
        }
        return token
    }

    static func readUserId() -> String? {
        guard let payload = readPayload(),
              let userId = payload.userId, !userId.isEmpty else {
            return nil
        }
        return userId
    }

    static func readSupabaseConfig() -> (url: String, anonKey: String)? {
        guard let payload = readPayload(),
              !payload.supabaseUrl.isEmpty,
              !payload.supabaseAnonKey.isEmpty else {
            return nil
        }
        return (payload.supabaseUrl, payload.supabaseAnonKey)
    }

    /// Single-parse convenience for callers that need multiple fields at once.
    /// Returns nil if the file is missing, unreadable, or malformed.
    static func readAll() -> Snapshot? {
        guard let payload = readPayload(),
              !payload.supabaseUrl.isEmpty,
              !payload.supabaseAnonKey.isEmpty else {
            return nil
        }
        return Snapshot(
            accessToken: payload.accessToken,
            userId: payload.userId,
            supabaseUrl: payload.supabaseUrl,
            supabaseAnonKey: payload.supabaseAnonKey
        )
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
