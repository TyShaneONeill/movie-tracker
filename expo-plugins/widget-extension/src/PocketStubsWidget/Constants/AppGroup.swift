import Foundation

enum AppGroup {
    static let identifier = "group.com.pocketstubs.app"
    static let widgetKind = "PocketStubsWidget"
    static let widgetDataFilename = "widget_data.json"
    static let widgetSubdir = "widget"
}

extension AppGroup {
    static let keychainAccessGroup = "$(AppIdentifierPrefix)com.pocketstubs.app"
    // Supabase JWT storage key matches main app's @supabase/supabase-js format
    static let supabaseTokenKey = "sb-wliblwulvsrfgqcnbzeh-auth-token"
}
