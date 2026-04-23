import SwiftUI

struct SeasonCompleteBadge: View {
    let show: Show

    var body: some View {
        VStack(spacing: 3) {
            Text("Completed!")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.green)
                // Phase 3: bounce when transitioning into / within complete state
                // (no-op on Text in iOS 17; forward-compatible for iOS 18+)
                .symbolEffect(.bounce, value: show.isSeasonComplete)

            if show.hasNextSeason, let next = show.nextSeasonNumber {
                // Phase 4c.3e: orange "S0N airs X" pill replaces the Start button
                // when the next season's first episode is unaired. Nil / past air
                // dates fall through to the existing tappable Start button.
                if isAirDateFuture(show.nextSeasonFirstAirDate),
                   let airDate = show.nextSeasonFirstAirDate {
                    AirDateBadge(text: "S\(String(format: "%02d", next)) airs \(formatAirDate(airDate))")
                } else {
                    Button(intent: StartNextSeasonIntent(
                        userTvShowId: show.userTvShowId,
                        tmdbShowId: show.tmdbId,
                        newSeasonNumber: next
                    )) {
                        Text("Start S\(String(format: "%02d", next))")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.primary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(Capsule())
                            // Phase 3: bounce when season advances (post-success reload)
                            .symbolEffect(.bounce, value: show.currentSeason)
                            // Phase 3: expand hit target ~8pt on each side toward 44pt HIG
                            .contentShape(Rectangle().inset(by: -8))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
