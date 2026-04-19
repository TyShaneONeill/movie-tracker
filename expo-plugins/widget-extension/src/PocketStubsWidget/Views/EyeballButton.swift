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
                // Phase 3: bounce when current_episode changes (post-success reload)
                .symbolEffect(.bounce, value: show.currentEpisode)
                .frame(width: 24, height: 24)
                .background(Color(.tertiarySystemFill))
                .clipShape(Circle())
                // Phase 3: 44pt Apple HIG minimum hit target via inset rectangle
                // — visual size unchanged (24x24) but tap area expands ~10pt
                // on all sides to give users a more forgiving tap region.
                .contentShape(Rectangle().inset(by: -10))
        }
        .buttonStyle(.plain)
        // Phase 3: haptic fires when the widget re-renders after a successful
        // mark-watched (current_episode changes). View-level .sensoryFeedback
        // is the iOS 17+ widget-compatible pattern - more reliable than
        // UIImpactFeedbackGenerator in AppIntent perform() because it doesn't
        // depend on the extension process still being alive when the hardware
        // fires.
        .sensoryFeedback(.success, trigger: show.currentEpisode)
    }
}
