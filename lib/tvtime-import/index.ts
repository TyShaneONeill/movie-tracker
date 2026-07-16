// TV Time import — pure parsing + TMDB matching core (PR 1).
// The UI layer (PR 2/3) unzips the export, feeds file contents to the parser,
// runs the matcher, and drives the bulk-write path behind the `tvtime_import` flag.

export { parseTvTimeExport } from './parser';
export { matchShows, matchMovies, matchTvTimePayload } from './matcher';
export { createDefaultTmdbGateway } from './gateway';
export { unzipTvTimeExport } from './unzip';
export {
  mapMatchToImportItems,
  chunkImportItems,
  sendImportChunk,
  runTvTimeImport,
  ChunkTooLargeError,
} from './import-client';
export type { ImportChunk, ChunkCaps, ImportProgress, RunImportArgs } from './import-client';
export {
  MAX_EPISODES_PER_CALL,
  MAX_MOVIES_PER_CALL,
  emptyImportCounts,
  addImportCounts,
} from './import-types';
export type {
  ImportEpisode,
  ImportShow,
  ImportMovie,
  ImportPayload,
  ImportCounts,
} from './import-types';
export {
  loadNeedsReview,
  saveNeedsReview,
  resolveNeedsReviewItem,
  clearNeedsReview,
  reviewItemId,
  getImportBannerDismissal,
  recordImportBannerDismissal,
} from './import-storage';
export type { PersistedReviewItem, ImportBannerDismissal } from './import-storage';
export { buildImportPreview, buildReviewItems } from './preview';
export type { ImportPreview } from './preview';
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
