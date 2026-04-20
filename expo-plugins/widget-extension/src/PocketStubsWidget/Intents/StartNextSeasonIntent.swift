import AppIntents
import WidgetKit

struct StartNextSeasonIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Next Season"
    static var description = IntentDescription("Advance to the first episode of the next season.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "User TV Show ID")
    var userTvShowId: String

    @Parameter(title: "TMDB Show ID")
    var tmdbShowId: Int

    @Parameter(title: "New Season Number")
    var newSeasonNumber: Int

    init() {}

    init(userTvShowId: String, tmdbShowId: Int, newSeasonNumber: Int) {
        self.userTvShowId = userTvShowId
        self.tmdbShowId = tmdbShowId
        self.newSeasonNumber = newSeasonNumber
    }

    func perform() async throws -> some IntentResult {
        let start = Date()

        // "Start S{N+1}" === "mark S{N+1} E01 watched" per design Q1.
        // sync_tv_show_progress RPC rolls current_season over on its own
        // when it sees a watched row in the new season.
        do {
            try await SupabaseWidgetClient.markEpisodeWatched(
                userTvShowId: userTvShowId,
                tmdbShowId: tmdbShowId,
                seasonNumber: newSeasonNumber,
                episodeNumber: 1
            )
            try? WidgetDataWriter.advanceSeason(userTvShowId: userTvShowId)
        } catch {
            // Silent per Q2
        }

        let elapsed = Date().timeIntervalSince(start)
        if elapsed < 1.5 {
            try? await Task.sleep(nanoseconds: UInt64((1.5 - elapsed) * 1_000_000_000))
        }

        WidgetCenter.shared.reloadTimelines(ofKind: AppGroup.widgetKind)
        return .result()
    }
}
