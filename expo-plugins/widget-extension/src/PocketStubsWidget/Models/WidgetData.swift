import Foundation

struct WidgetData: Codable {
    let version: Int
    let cachedAt: TimeInterval
    let stats: Stats
    let shows: [Show]

    enum CodingKeys: String, CodingKey {
        case version
        case cachedAt = "cached_at"
        case stats
        case shows
    }
}

struct Stats: Codable {
    let filmsWatched: Int
    let showsWatched: Int

    enum CodingKeys: String, CodingKey {
        case filmsWatched = "films_watched"
        case showsWatched = "shows_watched"
    }
}

struct Show: Codable {
    let userTvShowId: String
    let tmdbId: Int
    let name: String
    let posterFilename: String?
    let currentSeason: Int
    let currentEpisode: Int
    let totalSeasons: Int
    let isSeasonComplete: Bool
    let hasNextSeason: Bool
    let nextSeasonNumber: Int?
    let isShowComplete: Bool

    enum CodingKeys: String, CodingKey {
        case userTvShowId = "user_tv_show_id"
        case tmdbId = "tmdb_id"
        case name
        case posterFilename = "poster_filename"
        case currentSeason = "current_season"
        case currentEpisode = "current_episode"
        case totalSeasons = "total_seasons"
        case isSeasonComplete = "is_season_complete"
        case hasNextSeason = "has_next_season"
        case nextSeasonNumber = "next_season_number"
        case isShowComplete = "is_show_complete"
    }
}
