import UIKit
import Foundation

enum WidgetDataReader {
    static func read() -> WidgetData? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.identifier) else {
            return nil
        }
        let jsonURL = container.appendingPathComponent("\(AppGroup.widgetSubdir)/\(AppGroup.widgetDataFilename)")
        guard let data = try? Data(contentsOf: jsonURL) else { return nil }
        return try? JSONDecoder().decode(WidgetData.self, from: data)
    }

    static func loadPoster(filename: String) -> UIImage? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.identifier) else {
            return nil
        }
        let url = container.appendingPathComponent("\(AppGroup.widgetSubdir)/\(filename)")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }
}
