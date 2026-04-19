import ExpoModulesCore
import WidgetKit

// AppGroup identifier MUST match widget extension's Constants/AppGroup.swift
// AND lib/widget-constants.ts (source of truth for TS side)
private enum Shared {
    static let appGroup = "group.com.pocketstubs.app"
    static let widgetKind = "PocketStubsWidget"
    static let widgetSubdir = "widget"
    static let widgetDataFilename = "widget_data.json"
    static let authSubdir = "auth"
    static let authTokenFilename = "token.json"
}

public class WidgetBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WidgetBridgeModule")

        AsyncFunction("writeWidgetData") { (json: String) in
            guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Shared.appGroup
            ) else {
                throw Exception(name: "E_NO_CONTAINER", description: "App Groups container unavailable")
            }
            let dir = container.appendingPathComponent(Shared.widgetSubdir, isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(Shared.widgetDataFilename)
            try json.write(to: url, atomically: true, encoding: .utf8)
        }

        AsyncFunction("writePosterFile") { (filename: String, base64: String) in
            guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Shared.appGroup
            ), let data = Data(base64Encoded: base64) else {
                throw Exception(name: "E_WRITE", description: "Invalid input")
            }
            let url = container.appendingPathComponent("\(Shared.widgetSubdir)/\(filename)")
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: url)
        }

        // Writes the Supabase auth payload (or an explicit null-payload on signout) to
        // App Groups so the widget extension can read it. Replaces Keychain Sharing,
        // which required Apple Developer Portal config that broke the main app's auth.
        AsyncFunction("writeAuthToken") { (json: String) in
            guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Shared.appGroup
            ) else {
                throw Exception(name: "E_NO_CONTAINER", description: "App Groups container unavailable")
            }
            let dir = container.appendingPathComponent(Shared.authSubdir, isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(Shared.authTokenFilename)
            try json.write(to: url, atomically: true, encoding: .utf8)
        }

        AsyncFunction("reloadWidgetTimelines") {
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadTimelines(ofKind: Shared.widgetKind)
            }
        }
    }
}
