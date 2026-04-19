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

    init() {}

    init(userTvShowId: String, tmdbShowId: Int, seasonNumber: Int, episodeNumber: Int) {
        self.userTvShowId = userTvShowId
        self.tmdbShowId = tmdbShowId
        self.seasonNumber = seasonNumber
        self.episodeNumber = episodeNumber
    }

    func perform() async throws -> some IntentResult {
        let start = Date()

        // Silent failure path per design Q2: any error (missing auth, network,
        // 401/5xx, JSON patch failure) leaves the widget state unchanged and
        // the timeline reloads with the SAME data. User retries or opens app.
        do {
            try await SupabaseWidgetClient.markEpisodeWatched(
                userTvShowId: userTvShowId,
                tmdbShowId: tmdbShowId,
                seasonNumber: seasonNumber,
                episodeNumber: episodeNumber
            )
            try? WidgetDataWriter.markEpisodeWatched(userTvShowId: userTvShowId)
        } catch {
            // Silent. Intentional.
        }

        // Enforce 1.5s minimum so the button's disabled state is visibly
        // perceptible to the user. PRD: "Button disabled for minimum 1.5
        // seconds after tap regardless of API response time."
        let elapsed = Date().timeIntervalSince(start)
        if elapsed < 1.5 {
            try? await Task.sleep(nanoseconds: UInt64((1.5 - elapsed) * 1_000_000_000))
        }

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
