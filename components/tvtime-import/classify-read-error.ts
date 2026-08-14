// Classifies a TV Time read/parse/match failure into a Sentry-diagnosable
// code. Extracted from tvtime-import-screen.tsx's reportImportError so it's
// unit-testable without importing that screen as a value (which drags in a
// live Supabase client + auth-context — see pick-screen.test.tsx's note on
// the same hazard). The errors module is imported directly rather than
// through the barrel for the same reason: the barrel re-exports
// import-client, which instantiates the Supabase client at module load.
// DocumentCopyError comes from pick-document-error rather than pick-document
// on the same principle: the picker module imports expo-document-picker and
// expo-file-system at load, and only the error class is needed here.
import { TvTimeImportError, type TvTimeImportErrorCode } from '@/lib/tvtime-import/errors';
import { DocumentCopyError } from '@/lib/pick-document-error';

export function classifyTvTimeReadError(err: unknown): TvTimeImportErrorCode {
  if (err instanceof TvTimeImportError) return err.code;
  // lib/pick-document.ts's keepLocalCopy() copy failure (#815 review MED-2)
  // — previously fell into 'unknown', which is undiagnosable in Sentry.
  if (err instanceof DocumentCopyError) return 'copy-failed';
  return 'unknown';
}
