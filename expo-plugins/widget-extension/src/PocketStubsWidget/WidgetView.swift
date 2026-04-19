import SwiftUI
import WidgetKit

struct WidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StatsBar(stats: entry.data.stats)
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { idx in
                    if idx < entry.data.shows.count {
                        ShowCard(show: entry.data.shows[idx])
                    } else {
                        EmptySlot()
                    }
                }
            }
        }
        .widgetURL(URL(string: "pocketstubs://"))
    }
}

private struct StatsBar: View {
    let stats: Stats
    var body: some View {
        Text("\(stats.filmsWatched) films · \(stats.showsWatched) shows watched")
            .font(.caption)
            .foregroundColor(.secondary)
    }
}

private struct ShowCard: View {
    let show: Show

    var body: some View {
        VStack(spacing: 4) {
            // Poster area - tappable, deep-links to show detail (Phase 1 behavior preserved)
            Link(destination: URL(string: "pocketstubs://tv/\(show.tmdbId)")!) {
                PosterView(show: show)
                    .aspectRatio(2/3, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Bottom strip: either SeasonCompleteBadge (end-of-season state) or
            // episode label stacked above EyeballButton (mid-season state).
            // Link above and Button(intent:) here occupy separate tap regions.
            if show.isSeasonComplete {
                SeasonCompleteBadge(show: show)
            } else {
                VStack(spacing: 3) {
                    Text(episodeLabel)
                        .font(.caption2)
                        .foregroundColor(.primary)
                    EyeballButton(show: show)
                }
            }
        }
    }

    private var episodeLabel: String {
        String(format: "S%02d · E%02d", show.currentSeason, show.currentEpisode)
    }
}

private struct PosterView: View {
    let show: Show

    var body: some View {
        if let filename = show.posterFilename,
           let image = WidgetDataReader.loadPoster(filename: filename) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            TitleFallback(title: show.name)
        }
    }
}

private struct TitleFallback: View {
    let title: String
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(white: 0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(4)
                .lineLimit(3)
        }
    }
}

private struct EmptySlot: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Color(.systemGray5))
            .aspectRatio(2/3, contentMode: .fit)
    }
}
