//
//  PocketStubsWidget.swift
//  PocketStubsWidget
//
//  Phase 1, Task 2 — skeleton widget. Displays the literal text
//  "PocketStubs Widget" in the medium family with no data reads.
//  Task 3 will replace this with the real stats-bar + posters layout.
//

import WidgetKit
import SwiftUI

struct PocketStubsEntry: TimelineEntry {
    let date: Date
}

struct PocketStubsProvider: TimelineProvider {
    func placeholder(in context: Context) -> PocketStubsEntry {
        PocketStubsEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (PocketStubsEntry) -> Void) {
        completion(PocketStubsEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PocketStubsEntry>) -> Void) {
        // Static timeline — a single entry that never changes. Task 5 will
        // wire in the real cache-backed refresh schedule.
        let timeline = Timeline(entries: [PocketStubsEntry(date: Date())], policy: .never)
        completion(timeline)
    }
}

struct PocketStubsWidgetEntryView: View {
    var entry: PocketStubsProvider.Entry

    var body: some View {
        Text("PocketStubs Widget")
            .font(.headline)
            .multilineTextAlignment(.center)
            .padding()
    }
}

@main
struct PocketStubsWidget: Widget {
    let kind: String = "PocketStubsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PocketStubsProvider()) { entry in
            if #available(iOS 17.0, *) {
                PocketStubsWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                PocketStubsWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("PocketStubs")
        .description("Your recently watched movies at a glance.")
        .supportedFamilies([.systemMedium])
    }
}
