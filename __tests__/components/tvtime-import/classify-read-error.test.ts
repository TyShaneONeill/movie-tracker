// lib/pick-document.ts imports expo-document-picker at module load and that
// package ships untransformed ESM (it is not in jest.config's
// transformIgnorePatterns allowlist). Only the DocumentCopyError class is
// under test here and no picker call is made, so an empty mock is enough.
jest.mock('expo-document-picker', () => ({}));

import { classifyTvTimeReadError } from '@/components/tvtime-import/classify-read-error';
// Imported from the errors module directly, not the '@/lib/tvtime-import'
// barrel: the barrel re-exports import-client, which builds a live Supabase
// client whose auth auto-refresh timer outlives this suite's teardown (same
// avoidance as unzip.test.ts).
import { TvTimeImportError } from '@/lib/tvtime-import/errors';
import { DocumentCopyError } from '@/lib/pick-document';

describe('classifyTvTimeReadError', () => {
  it('returns the code carried by a TvTimeImportError', () => {
    expect(classifyTvTimeReadError(new TvTimeImportError('not-a-zip', 'user copy'))).toBe('not-a-zip');
    expect(classifyTvTimeReadError(new TvTimeImportError('missing-expected-csv', 'user copy'))).toBe(
      'missing-expected-csv'
    );
  });

  it("classifies the picker wrapper's copy failure as 'copy-failed' (#815 review MED-2)", () => {
    expect(classifyTvTimeReadError(new DocumentCopyError())).toBe('copy-failed');
  });

  it("returns 'unknown' for any other error, including raw native errors", () => {
    expect(classifyTvTimeReadError(new Error('NSCocoaErrorDomain: could not move file "gdpr-data.zip"'))).toBe(
      'unknown'
    );
    expect(classifyTvTimeReadError('a string throwable')).toBe('unknown');
    expect(classifyTvTimeReadError(undefined)).toBe('unknown');
  });
});
