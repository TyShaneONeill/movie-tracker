import Foundation
import Security

/// Reads the Supabase access_token from the shared Keychain group.
/// The main app's @supabase/supabase-js client stores the full session (JSON)
/// at key "sb-<project-ref>-auth-token" via the SecureStore adapter
/// (lib/secure-storage.ts with accessGroup: 'com.pocketstubs.app').
///
/// Returns nil when:
/// - User is signed out (no keychain item)
/// - Token is unreadable
/// - JSON parse fails
///
/// Does NOT check expiry - an expired token just produces a 401 from
/// Supabase, which we handle as silent failure per design Q2.
enum KeychainTokenReader {
    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: AppGroup.supabaseTokenKey,
            kSecAttrAccessGroup as String: AppGroup.keychainAccessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }

        // expo-secure-store writes UTF-8 encoded strings. The Supabase JS client
        // stores the full session as a JSON string, so we parse out access_token.
        // If parsing fails (legacy raw-JWT storage?), fall back to the raw value.
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let accessToken = json["access_token"] as? String {
            return accessToken
        }

        return String(data: data, encoding: .utf8)
    }

    /// Reads the user_id ("sub" claim) from the current JWT.
    /// Needed for the user_episode_watches INSERT payload.
    /// JWT format: header.payload.signature - each segment is base64url-encoded.
    static func readUserId() -> String? {
        guard let token = read() else { return nil }
        let segments = token.split(separator: ".")
        guard segments.count == 3 else { return nil }
        let payload = String(segments[1])

        // base64url → base64: replace `-` with `+`, `_` with `/`, pad with `=` to multiple of 4
        var padded = payload.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while padded.count % 4 != 0 { padded.append("=") }

        guard let data = Data(base64Encoded: padded),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = json["sub"] as? String else {
            return nil
        }
        return sub
    }
}
