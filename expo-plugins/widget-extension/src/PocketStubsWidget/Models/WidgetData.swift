import Foundation

struct WidgetData: Codable {
    let version: Int
    let cachedAt: TimeInterval
    let stats: Stats
    let shows: [Show]
    let movies: [Movie]? // Optional for v1 → v2 compat; default nil so old callers compile

    enum CodingKeys: String, CodingKey {
        case version
        case cachedAt = "cached_at"
        case stats
        case shows
        case movies
    }

    // Custom init(from:) required because `movies` has no stored default value
    // (Swift only synthesises memberwise defaults for `var`, not `let`).
    // decodeIfPresent keeps v1 cache files (no "movies" key) working.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        cachedAt = try c.decode(TimeInterval.self, forKey: .cachedAt)
        stats = try c.decode(Stats.self, forKey: .stats)
        shows = try c.decode([Show].self, forKey: .shows)
        movies = try c.decodeIfPresent([Movie].self, forKey: .movies)
    }

    // Explicit memberwise init so callers can omit movies (defaults to nil).
    init(version: Int, cachedAt: TimeInterval, stats: Stats, shows: [Show], movies: [Movie]? = nil) {
        self.version = version
        self.cachedAt = cachedAt
        self.stats = stats
        self.shows = shows
        self.movies = movies
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
    // Phase 4c.3e: ISO-8601 date (yyyy-MM-dd) for the next episode in
    // currentSeason (episode = currentEpisode+1). Null when the catalog
    // has no row or date is unknown.
    let nextEpisodeAirDate: String?
    // Phase 4c.3e: ISO-8601 date for the first episode of nextSeasonNumber.
    // Null when !hasNextSeason or catalog has no row.
    let nextSeasonFirstAirDate: String?

    // Explicit memberwise init — required because the custom init(from:) below
    // suppresses Swift's synthesized memberwise initializer.
    // isTrophy and isLastUpdated default to false so pre-Phase-4a callers compile.
    // nextEpisodeAirDate / nextSeasonFirstAirDate default to nil so pre-Phase-4c.3e
    // callers compile.
    init(
        userTvShowId: String,
        tmdbId: Int,
        name: String,
        posterFilename: String?,
        currentSeason: Int,
        currentEpisode: Int,
        totalSeasons: Int,
        totalEpisodesInCurrentSeason: Int?,
        episodesBySeason: [String: Int],
        isSeasonComplete: Bool,
        hasNextSeason: Bool,
        nextSeasonNumber: Int?,
        isShowComplete: Bool,
        isTrophy: Bool = false,
        isLastUpdated: Bool = false,
        nextEpisodeAirDate: String? = nil,
        nextSeasonFirstAirDate: String? = nil
    ) {
        self.userTvShowId = userTvShowId
        self.tmdbId = tmdbId
        self.name = name
        self.posterFilename = posterFilename
        self.currentSeason = currentSeason
        self.currentEpisode = currentEpisode
        self.totalSeasons = totalSeasons
        self.totalEpisodesInCurrentSeason = totalEpisodesInCurrentSeason
        self.episodesBySeason = episodesBySeason
        self.isSeasonComplete = isSeasonComplete
        self.hasNextSeason = hasNextSeason
        self.nextSeasonNumber = nextSeasonNumber
        self.isShowComplete = isShowComplete
        self.isTrophy = isTrophy
        self.isLastUpdated = isLastUpdated
        self.nextEpisodeAirDate = nextEpisodeAirDate
        self.nextSeasonFirstAirDate = nextSeasonFirstAirDate
    }

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
        case nextEpisodeAirDate = "next_episode_air_date"
        case nextSeasonFirstAirDate = "next_season_first_air_date"
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
        // Phase 4c.3e: v3 air-date fields default to nil when decoding v2 cache
        nextEpisodeAirDate = try c.decodeIfPresent(String.self, forKey: .nextEpisodeAirDate)
        nextSeasonFirstAirDate = try c.decodeIfPresent(String.self, forKey: .nextSeasonFirstAirDate)
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
