import SwiftUI

struct SeasonCompleteBadge: View {
    let show: Show

    var body: some View {
        VStack(spacing: 3) {
            Text("Completed!")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.green)

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
                }
                .buttonStyle(.plain)
            }
        }
    }
}
