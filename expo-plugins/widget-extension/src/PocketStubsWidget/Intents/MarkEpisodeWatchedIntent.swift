import AppIntents
import CoreHaptics
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
        // even before the network round-trip completes. Testing CHHapticEngine
        // (Core Haptics) as a lower-level alternative to UIImpactFeedbackGenerator,
        // which Apple confirmed is blocked in non-foreground-active processes.
        if let engine = try? CHHapticEngine() {
            do {
                try engine.start()
                let event = CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.5),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
                    ],
                    relativeTime: 0
                )
                let pattern = try CHHapticPattern(events: [event], parameters: [])
                let player = try engine.makePlayer(with: pattern)
                try player.start(atTime: 0)
                // Keep engine alive briefly so the event plays
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    engine.stop()
                }
            } catch {
                // Silent fail — widget design doesn't surface errors
            }
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
            if let engine = try? CHHapticEngine() {
                do {
                    try engine.start()
                    let event = CHHapticEvent(
                        eventType: .hapticTransient,
                        parameters: [
                            CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8),
                            CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
                        ],
                        relativeTime: 0
                    )
                    let pattern = try CHHapticPattern(events: [event], parameters: [])
                    let player = try engine.makePlayer(with: pattern)
                    try player.start(atTime: 0)
                    // Keep engine alive briefly so the event plays
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        engine.stop()
                    }
                } catch {
                    // Silent fail — widget design doesn't surface errors
                }
            }
        }

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
