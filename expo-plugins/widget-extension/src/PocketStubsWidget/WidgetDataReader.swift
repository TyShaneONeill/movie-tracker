import UIKit
import Foundation

enum WidgetDataReader {
    static let appGroup = "group.com.pocketstubs.app"

    static func read() -> WidgetData? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            return nil
        }
        let jsonURL = container.appendingPathComponent("widget/widget_data.json")
        guard let data = try? Data(contentsOf: jsonURL) else { return nil }
        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }

    static func loadPoster(filename: String) -> UIImage? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            return nil
        }
        let url = container.appendingPathComponent("widget/\(filename)")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }
}
