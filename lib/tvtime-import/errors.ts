/**
 * Typed, machine-readable error codes for the TV Time import read path
 * (pick file -> unzip -> parse -> match). Thrown by {@link unzipTvTimeExport}
 * and the screen's parse/match steps so the catch block can tell Sentry
 * WHERE and HOW it failed without ever sending file contents, entry names,
 * or titles (PII hygiene — see tvtime-import-screen.tsx's read-failed catch).
 */
export type TvTimeImportErrorCode =
  | 'file-read-failed' // couldn't read the picked file's bytes (missing/empty/unreadable cache copy)
  | 'file-too-large' // picked file exceeds the size ceiling
  | 'not-a-zip' // bytes don't start with the ZIP magic number
  | 'unzip-failed' // magic number matched but fflate couldn't decompress it (corrupt/truncated ZIP)
  | 'missing-expected-csv' // valid ZIP, but none of the allowlisted TV Time CSVs were inside
  | 'csv-parse-failed' // an allowlisted CSV was unreadable as CSV
  | 'match-network-failed' // TMDB matching couldn't reach the backend
  | 'unknown';

export class TvTimeImportError extends Error {
  readonly code: TvTimeImportErrorCode;

  constructor(code: TvTimeImportErrorCode, message: string) {
    super(message);
    this.name = 'TvTimeImportError';
    this.code = code;
  }
}
