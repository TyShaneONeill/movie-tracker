import AppIntents
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

    // Plain stored property (not @Parameter) — internal wiring value,
    // never prompted for in Shortcuts app. 0 means "unknown", which
    // safely signals the RPC to skip the auto-flip branch.
    var totalEpisodesInSeason: Int = 0

    init() {}

    init(userTvShowId: String, tmdbShowId: Int, seasonNumber: Int, episodeNumber: Int, totalEpisodesInSeason: Int) {
        self.userTvShowId = userTvShowId
        self.tmdbShowId = tmdbShowId
        self.seasonNumber = seasonNumber
        self.episodeNumber = episodeNumber
        self.totalEpisodesInSeason = totalEpisodesInSeason
    }

    func perform() async throws -> some IntentResult {
        let start = Date()

        // Silent failure path per design Q2: any error leaves state unchanged
        // and the timeline reloads with the same data. User retries or opens
        // the app.
        do {
            try await SupabaseWidgetClient.markEpisodeWatched(
                userTvShowId: userTvShowId,
                tmdbShowId: tmdbShowId,
                seasonNumber: seasonNumber,
                episodeNumber: episodeNumber,
                totalEpisodesInSeason: totalEpisodesInSeason
            )
            try? WidgetDataWriter.markEpisodeWatched(userTvShowId: userTvShowId)
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

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
