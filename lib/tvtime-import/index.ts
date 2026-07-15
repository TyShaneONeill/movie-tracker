// TV Time import — pure parsing + TMDB matching core (PR 1).
// The UI layer (PR 2/3) unzips the export, feeds file contents to the parser,
// runs the matcher, and drives the bulk-write path behind the `tvtime_import` flag.

export { parseTvTimeExport } from './parser';
export { matchShows, matchMovies, matchTvTimePayload } from './matcher';
export { createDefaultTmdbGateway } from './gateway';
export type {
  ParsedEpisode,
  ParsedShow,
  ParsedMovie,
  ParsedTvTimePayload,
  TvTimeFileMap,
  MatchedShow,
  MatchedMovie,
  MovieNeedsReview,
  ShowMatchResult,
  MovieMatchResult,
  TvTimeMatchResult,
  TmdbGateway,
  MatchOptions,
} from './types';
