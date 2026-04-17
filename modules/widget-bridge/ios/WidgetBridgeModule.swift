import ExpoModulesCore
import WidgetKit

public class WidgetBridgeModule: Module {
    static let appGroup = "group.com.pocketstubs.app"
    static let widgetKind = "PocketStubsWidget"

    public func definition() -> ModuleDefinition {
        Name("WidgetBridgeModule")

        AsyncFunction("writeWidgetData") { (json: String) in
            guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Self.appGroup
            ) else {
                throw Exception(name: "E_NO_CONTAINER", description: "App Groups container unavailable")
            }
            let dir = container.appendingPathComponent("widget", isDirectory: true)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent("widget_data.json")
            try json.write(to: url, atomically: true, encoding: .utf8)
        }

        AsyncFunction("writePosterFile") { (filename: String, base64: String) in
            guard let container = FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: Self.appGroup
            ), let data = Data(base64Encoded: base64) else {
                throw Exception(name: "E_WRITE", description: "Invalid input")
            }
            let url = container.appendingPathComponent("widget/\(filename)")
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: url)
        }

        AsyncFunction("reloadWidgetTimelines") {
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
            }
        }
    }
}
