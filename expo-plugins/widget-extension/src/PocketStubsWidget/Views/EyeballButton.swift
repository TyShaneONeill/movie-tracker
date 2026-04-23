import SwiftUI

struct EyeballButton: View {
    let show: Show

    // Phase 4c.3c: reads the per-show rejection counter written by
    // MarkEpisodeWatchedIntent's catch block. Computed per body
    // re-render; SwiftUI observes the changing value on the
    // .symbolEffect(.wiggle) modifier above.
    private func rejectionCount(for userTvShowId: String) -> Int {
        UserDefaults(suiteName: AppGroup.identifier)?
            .integer(forKey: "widget.markRejection.\(userTvShowId)") ?? 0
    }

    var body: some View {
        Group {
            if show.isTrophy {
                EmptyView()
            } else {
                Button(intent: MarkEpisodeWatchedIntent(
                    userTvShowId: show.userTvShowId,
                    tmdbShowId: show.tmdbId,
                    seasonNumber: show.currentSeason,
                    episodeNumber: show.currentEpisode + 1,
                    totalEpisodesInSeason: show.totalEpisodesInCurrentSeason ?? 0
                )) {
                    Image(systemName: "eye")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.primary)
                        // Phase 3: bounce when current_episode changes (post-success reload)
                        .symbolEffect(.bounce, value: show.currentEpisode)
                        // Phase 4c.3c: wiggle on RPC rejection (unaired or
                        // missing catalog row). Reads per-show counter from
                        // App Group UserDefaults; timeline reload after the
                        // intent triggers body re-eval which re-reads the
                        // counter and drives this symbolEffect.
                        .symbolEffect(.wiggle, value: rejectionCount(for: show.userTvShowId))
                        .frame(width: 24, height: 24)
                        .background(Color(.tertiarySystemFill))
                        .clipShape(Circle())
                        // Phase 3: 44pt Apple HIG minimum hit target via inset rectangle
                        // — visual size unchanged (24x24) but tap area expands ~10pt
                        // on all sides to give users a more forgiving tap region.
                        .contentShape(Rectangle().inset(by: -10))
                }
                .buttonStyle(.plain)
            }
        }
    }
}
