import SwiftUI

struct EyeballButton: View {
    let show: Show

    var body: some View {
        Button(intent: MarkEpisodeWatchedIntent(
            userTvShowId: show.userTvShowId,
            tmdbShowId: show.tmdbId,
            seasonNumber: show.currentSeason,
            episodeNumber: show.currentEpisode + 1
        )) {
            Image(systemName: "eye")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary)
                .frame(width: 24, height: 24)
                .background(Color(.tertiarySystemFill))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}
