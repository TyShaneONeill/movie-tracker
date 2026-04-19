import Foundation

struct WidgetData: Codable {
    let version: Int
    let cachedAt: TimeInterval
    let stats: Stats
    let shows: [Show]
    let movies: [Movie]?   // Optional for v1 → v2 compat

    enum CodingKeys: String, CodingKey {
        case version
        case cachedAt = "cached_at"
        case stats
        case shows
        case movies
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
    let totalEpisodesInCurrentSeason: Int?
    let episodesBySeason: [String: Int]
    let isSeasonComplete: Bool
    let hasNextSeason: Bool
    let nextSeasonNumber: Int?
    let isShowComplete: Bool
    let isTrophy: Bool
    let isLastUpdated: Bool

    enum CodingKeys: String, CodingKey {
        case userTvShowId = "user_tv_show_id"
        case tmdbId = "tmdb_id"
        case name
        case posterFilename = "poster_filename"
        case currentSeason = "current_season"
        case currentEpisode = "current_episode"
        case totalSeasons = "total_seasons"
        case totalEpisodesInCurrentSeason = "total_episodes_in_current_season"
        case episodesBySeason = "episodes_by_season"
        case isSeasonComplete = "is_season_complete"
        case hasNextSeason = "has_next_season"
        case nextSeasonNumber = "next_season_number"
        case isShowComplete = "is_show_complete"
        case isTrophy = "is_trophy"
        case isLastUpdated = "is_last_updated"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userTvShowId = try c.decode(String.self, forKey: .userTvShowId)
        tmdbId = try c.decode(Int.self, forKey: .tmdbId)
        name = try c.decode(String.self, forKey: .name)
        posterFilename = try c.decodeIfPresent(String.self, forKey: .posterFilename)
        currentSeason = try c.decode(Int.self, forKey: .currentSeason)
        currentEpisode = try c.decode(Int.self, forKey: .currentEpisode)
        totalSeasons = try c.decode(Int.self, forKey: .totalSeasons)
        totalEpisodesInCurrentSeason = try c.decodeIfPresent(Int.self, forKey: .totalEpisodesInCurrentSeason)
        episodesBySeason = try c.decode([String: Int].self, forKey: .episodesBySeason)
        isSeasonComplete = try c.decode(Bool.self, forKey: .isSeasonComplete)
        hasNextSeason = try c.decode(Bool.self, forKey: .hasNextSeason)
        nextSeasonNumber = try c.decodeIfPresent(Int.self, forKey: .nextSeasonNumber)
        isShowComplete = try c.decode(Bool.self, forKey: .isShowComplete)
        // v2 fields default to false when decoding v1 cache
        isTrophy = try c.decodeIfPresent(Bool.self, forKey: .isTrophy) ?? false
        isLastUpdated = try c.decodeIfPresent(Bool.self, forKey: .isLastUpdated) ?? false
    }
}

struct Movie: Codable {
    let tmdbId: Int
    let name: String
    let posterFilename: String?

    enum CodingKeys: String, CodingKey {
        case tmdbId = "tmdb_id"
        case name
        case posterFilename = "poster_filename"
    }
}
