import Foundation

/// Patches widget_data.json in App Groups after a successful Supabase mutation.
/// Avoids a full RN-side resync for the common case of a single-episode change.
/// Main app's useWidgetSync reconciles on next foreground with authoritative data.
enum WidgetDataWriter {
    enum WriterError: Error {
        case noContainer
        case readFailed
        case writeFailed
        case showNotFound
    }

    /// Increments current_episode for the given show and recomputes season flags.
    static func markEpisodeWatched(userTvShowId: String) throws {
        try patch { data in
            guard let idx = data.shows.firstIndex(where: { $0.userTvShowId == userTvShowId }) else {
                throw WriterError.showNotFound
            }
            var shows = data.shows
            let old = shows[idx]
            let newEpisode = old.currentEpisode + 1
            let totalInSeason = old.totalEpisodesInCurrentSeason ?? 0
            let isSeasonComplete = totalInSeason > 0 && newEpisode >= totalInSeason

            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: old.currentSeason,
                currentEpisode: newEpisode,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: old.totalEpisodesInCurrentSeason,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: old.hasNextSeason,
                nextSeasonNumber: old.nextSeasonNumber,
                isShowComplete: isSeasonComplete && !old.hasNextSeason
            )

            return WidgetData(version: data.version, cachedAt: data.cachedAt, stats: data.stats, shows: shows)
        }
    }

    /// Advances current_season by 1 and sets current_episode to 1 (per design Q1).
    /// Recomputes totalEpisodesInCurrentSeason from episodes_by_season map.
    static func advanceSeason(userTvShowId: String) throws {
        try patch { data in
            guard let idx = data.shows.firstIndex(where: { $0.userTvShowId == userTvShowId }) else {
                throw WriterError.showNotFound
            }
            var shows = data.shows
            let old = shows[idx]
            let newSeason = old.currentSeason + 1
            let newTotalInSeason = old.episodesBySeason[String(newSeason)] ?? 0
            let hasNext = newSeason < old.totalSeasons
            // Edge case: single-episode season → immediately complete after advance
            let isSeasonComplete = newTotalInSeason > 0 && 1 >= newTotalInSeason

            shows[idx] = Show(
                userTvShowId: old.userTvShowId,
                tmdbId: old.tmdbId,
                name: old.name,
                posterFilename: old.posterFilename,
                currentSeason: newSeason,
                currentEpisode: 1,
                totalSeasons: old.totalSeasons,
                totalEpisodesInCurrentSeason: newTotalInSeason > 0 ? newTotalInSeason : nil,
                episodesBySeason: old.episodesBySeason,
                isSeasonComplete: isSeasonComplete,
                hasNextSeason: hasNext,
                nextSeasonNumber: hasNext ? newSeason + 1 : nil,
                isShowComplete: isSeasonComplete && !hasNext
            )

            return WidgetData(version: data.version, cachedAt: data.cachedAt, stats: data.stats, shows: shows)
        }
    }

    private static func patch(_ mutation: (WidgetData) throws -> WidgetData) throws {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.identifier) else {
            throw WriterError.noContainer
        }
        let url = container.appendingPathComponent("\(AppGroup.widgetSubdir)/\(AppGroup.widgetDataFilename)")
        guard let data = try? Data(contentsOf: url),
              let current = try? JSONDecoder().decode(WidgetData.self, from: data) else {
            throw WriterError.readFailed
        }
        let patched = try mutation(current)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys] // deterministic output, easier diffing
        let newData = try encoder.encode(patched)
        try newData.write(to: url, options: [.atomic])
    }
}
