import SwiftUI
import WidgetKit

struct WidgetView: View {
    let entry: WidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            StatsBar(stats: entry.data.stats)
            GeometryReader { geo in
                let hasMovies = !(entry.data.movies?.isEmpty ?? true)
                let spacing: CGFloat = 6
                let slotCount: CGFloat = hasMovies ? 4 : 3
                let totalGaps = spacing * (slotCount - 1)
                let movieColWidth: CGFloat = hasMovies ? 44 : 0
                let availableForShows = geo.size.width - totalGaps - movieColWidth
                let showWidth = availableForShows / 3   // equal for all 3 slots

                HStack(spacing: spacing) {
                    ForEach(0..<3, id: \.self) { idx in
                        if idx < entry.data.shows.count {
                            let show = entry.data.shows[idx]
                            ShowCard(show: show)
                                .frame(width: showWidth, height: geo.size.height)
                        } else {
                            EmptySlot()
                                .frame(width: showWidth, height: geo.size.height)
                        }
                    }
                    if hasMovies, let movies = entry.data.movies {
                        MovieColumn(movies: movies)
                            .frame(width: movieColWidth, height: geo.size.height)
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
        Text("Watched: \(stats.filmsWatched) Movies · \(stats.showsWatched) TV Shows")
            .font(.caption)
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

private struct ShowCard: View {
    let show: Show

    var body: some View {
        VStack(spacing: 8) {
            Link(destination: URL(string: "pocketstubs://tv/\(show.tmdbId)")!) {
                PosterView(show: show)
                    .aspectRatio(2/3, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(
                        show.isLastUpdated && !show.isTrophy
                            ? RoundedRectangle(cornerRadius: 6)
                                .strokeBorder(Color.orange.opacity(0.85), lineWidth: 2)
                            : nil
                    )
                    .shadow(
                        color: show.isLastUpdated && !show.isTrophy
                            ? Color.orange.opacity(0.4)
                            : Color.clear,
                        radius: 4
                    )
                    .scaleEffect(show.isLastUpdated && !show.isTrophy ? 1.04 : 1.0)
                    .trophyOverlay(enabled: show.isTrophy)
            }

            Group {
                if show.isTrophy {
                    EmptyView()
                } else if show.isSeasonComplete {
                    SeasonCompleteBadge(show: show)
                } else {
                    VStack(spacing: 2) {
                        Text(episodeLabel)
                            .font(.caption2)
                            .foregroundColor(.primary)
                        EyeballButton(show: show)
                    }
                }
            }
            .frame(height: 28)
            .frame(maxWidth: .infinity)
        }
    }

    private var episodeLabel: String {
        String(format: "S%02d · E%02d", show.currentSeason, show.currentEpisode)
    }
}

private struct MovieColumn: View {
    let movies: [Movie]

    var body: some View {
        VStack(spacing: 4) {
            if movies.count >= 1 {
                MovieThumb(movie: movies[0])
            }
            if movies.count >= 2 {
                MovieThumb(movie: movies[1])
            } else if movies.count == 1 {
                Spacer().frame(width: 44)
            }
        }
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
                .clipped()
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
