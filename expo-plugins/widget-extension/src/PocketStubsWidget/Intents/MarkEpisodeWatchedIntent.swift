import AppIntents
import UIKit
import WidgetKit

struct MarkEpisodeWatchedIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Episode Watched"
    static var description = IntentDescription("Mark the next episode of this show as watched.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "User TV Show ID")
    var userTvShowId: String

    @Parameter(title: "TMDB Show ID")
    var tmdbShowId: Int

    @Parameter(title: "Season Number")
    var seasonNumber: Int

    @Parameter(title: "Episode Number")
    var episodeNumber: Int

    init() {}

    init(userTvShowId: String, tmdbShowId: Int, seasonNumber: Int, episodeNumber: Int) {
        self.userTvShowId = userTvShowId
        self.tmdbShowId = tmdbShowId
        self.seasonNumber = seasonNumber
        self.episodeNumber = episodeNumber
    }

    func perform() async throws -> some IntentResult {
        let start = Date()

        // Tap-start haptic fires immediately — user feels confirmation
        // even before the network round-trip completes. UIKit feedback
        // generators require the main thread.
        await MainActor.run {
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.prepare()
            generator.impactOccurred()
        }

        // Silent failure path per design Q2: any error leaves state unchanged
        // and the timeline reloads with the same data. User retries or opens
        // the app.
        var succeeded = false
        do {
            try await SupabaseWidgetClient.markEpisodeWatched(
                userTvShowId: userTvShowId,
                tmdbShowId: tmdbShowId,
                seasonNumber: seasonNumber,
                episodeNumber: episodeNumber
            )
            try? WidgetDataWriter.markEpisodeWatched(userTvShowId: userTvShowId)
            succeeded = true
        } catch {
            // Silent. Intentional.
        }

        // Enforce 1.5s minimum so the button's disabled state is visibly
        // perceptible. PRD: "Button disabled for minimum 1.5 seconds after
        // tap regardless of API response time."
        let elapsed = Date().timeIntervalSince(start)
        if elapsed < 1.5 {
            try? await Task.sleep(nanoseconds: UInt64((1.5 - elapsed) * 1_000_000_000))
        }

        // Success haptic fires only on success - distinguishes "your tap
        // stuck" from "your tap tried" without a visual error affordance.
        if succeeded {
            await MainActor.run {
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.prepare()
                generator.impactOccurred()
            }
        }

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
