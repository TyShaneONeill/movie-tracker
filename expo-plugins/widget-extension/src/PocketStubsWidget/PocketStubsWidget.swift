import WidgetKit
import SwiftUI

struct WidgetEntry: TimelineEntry {
    let date: Date
    let data: WidgetData

    static let placeholderData = WidgetData(
        version: 1,
        cachedAt: 0,
        stats: Stats(filmsWatched: 0, showsWatched: 0),
        shows: []
    )
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), data: WidgetEntry.placeholderData)
    }

    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let data = WidgetDataReader.read() ?? WidgetEntry.placeholderData
        completion(WidgetEntry(date: Date(), data: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let data = WidgetDataReader.read() ?? WidgetEntry.placeholderData
        let entry = WidgetEntry(date: Date(), data: data)
        // Refresh every 30 minutes. App foreground and mark-watched also
        // trigger reloads via WidgetCenter (Task 5/6 wire that up).
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

@main
struct PocketStubsWidget: Widget {
    let kind: String = "PocketStubsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                WidgetView(entry: entry)
                    .containerBackground(Color(.systemBackground), for: .widget)
            } else {
                WidgetView(entry: entry)
                    .padding(12)
                    .background(Color(.systemBackground))
            }
        }
        .configurationDisplayName("Continue Watching")
        .description("Your current shows, one tap away.")
        .supportedFamilies([.systemMedium])
    }
}
