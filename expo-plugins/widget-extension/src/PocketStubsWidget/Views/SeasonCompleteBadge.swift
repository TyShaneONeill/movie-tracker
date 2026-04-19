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
                // Phase 3: haptic fires when the widget re-renders with an
                // advanced current_season. See EyeballButton for pattern rationale.
                // Verified non-firing on iOS 26.5 device 2026-04-18; kept for forward compat.
                .sensoryFeedback(.success, trigger: show.currentSeason)
            }
        }
    }
}
