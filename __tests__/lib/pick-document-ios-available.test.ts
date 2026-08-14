// iOS + native module present (issue #810 fix path): pickTvTimeZipFile /
// pickLetterboxdCsvFile use the full-screen @react-native-documents/picker
// wrapper, never expo-document-picker. Kept in a separate file from
// pick-document-ios-unavailable.test.ts and pick-document-non-ios.test.ts
// because both Platform.OS and the @react-native-documents/picker mock are
// fixed per-file (mirrors the unzip-native-read.test.ts convention).
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockDeleteAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

const mockPick = jest.fn();
const mockKeepLocalCopy = jest.fn();

class MockNativeModuleError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

jest.mock('@react-native-documents/picker', () => ({
  pick: (...args: unknown[]) => mockPick(...args),
  keepLocalCopy: (...args: unknown[]) => mockKeepLocalCopy(...args),
  // Matches the library's real predicate (lib/module/errors.js):
  // `(error instanceof Error || (typeof error === 'object' && error != null)) && 'code' in error`
  isErrorWithCode: (error: unknown): error is MockNativeModuleError => {
    const isObjectError = typeof error === 'object' && error != null;
    return (error instanceof Error || isObjectError) && 'code' in (error as object);
  },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));

import { pickTvTimeZipFile, pickLetterboxdCsvFile, releasePickedDocument } from '@/lib/pick-document';

// keepLocalCopy() puts the copy in a per-pick Caches/<UUID>/ directory, so
// the fixtures mirror that shape rather than a bare cache path. The UUID has
// to be well-formed: recognising it is what licenses deleting the directory.
const CACHE_DIR = 'file:///cache/9E1F0C2A-4B7D-4F2E-9A31-6C5D8E0F1A2B';

describe('pick-document on iOS with the native picker available', () => {
  afterEach(() => {
    mockPick.mockReset();
    mockKeepLocalCopy.mockReset();
    mockGetDocumentAsync.mockReset();
    mockDeleteAsync.mockReset();
  });

  it('pickTvTimeZipFile presents fullScreen with zip + allFiles UTIs and returns the cached uri', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${CACHE_DIR}/export.zip` }]);

    const result = await pickTvTimeZipFile();

    // Reads come from the file; cleanup targets the directory that holds it,
    // so the per-pick directory doesn't outlive the copy (issue #816).
    expect(result).toEqual({ canceled: false, uri: `${CACHE_DIR}/export.zip`, cleanupUri: CACHE_DIR });
    expect(mockPick).toHaveBeenCalledWith({ type: ['public.zip-archive', 'public.item'], presentationStyle: 'fullScreen' });
    expect(mockKeepLocalCopy).toHaveBeenCalledWith({
      files: [{ uri: 'file:///picked/export.zip', fileName: 'export.zip' }],
      destination: 'cachesDirectory',
    });
    expect(mockGetDocumentAsync).not.toHaveBeenCalled();
  });

  it('pickLetterboxdCsvFile presents fullScreen with csv + allFiles UTIs and returns the cached uri', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/watched.csv', name: null }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${CACHE_DIR}/watched.csv` }]);

    const result = await pickLetterboxdCsvFile();

    expect(result).toEqual({ canceled: false, uri: `${CACHE_DIR}/watched.csv`, cleanupUri: CACHE_DIR });
    expect(mockPick).toHaveBeenCalledWith({
      type: ['public.comma-separated-values-text', 'public.item'],
      presentationStyle: 'fullScreen',
    });
    // Falls back to the caller-provided name when the pick has none.
    expect(mockKeepLocalCopy).toHaveBeenCalledWith({
      files: [{ uri: 'file:///picked/watched.csv', fileName: 'letterboxd-export.csv' }],
      destination: 'cachesDirectory',
    });
    expect(mockGetDocumentAsync).not.toHaveBeenCalled();
  });

  it('returns a clean canceled result when the user dismisses the picker, without surfacing an error', async () => {
    mockPick.mockRejectedValue(new MockNativeModuleError('OPERATION_CANCELED'));

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: true });
    expect(mockKeepLocalCopy).not.toHaveBeenCalled();
  });

  it('rethrows non-cancellation pick errors', async () => {
    mockPick.mockRejectedValue(new MockNativeModuleError('UNABLE_TO_OPEN_FILE_TYPE'));

    await expect(pickTvTimeZipFile()).rejects.toThrow('UNABLE_TO_OPEN_FILE_TYPE');
  });

  it('throws a generic error (never the raw NSError text) when keepLocalCopy reports a copy error', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'error', copyError: 'disk full: /private/var/mobile/...' }]);

    await expect(pickTvTimeZipFile()).rejects.toThrow('document-copy-failed');
    // Pins the native contract this path relies on: the copy is a move into
    // a directory created first, so a reported error means no file landed —
    // and the empty directory's path is never sent to JS, leaving nothing
    // for us to delete. If a future library version starts returning a uri
    // on error, this expectation is what should force the cleanup.
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('guards against pick() resolving with an empty array', async () => {
    mockPick.mockResolvedValue([]);

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: true });
    expect(mockKeepLocalCopy).not.toHaveBeenCalled();
  });

  // The copy is the user's TV Time export — auth-token / password-hash CSVs.
  // A copy the wrapper throws away instead of returning is one the caller can
  // never delete, because it never receives a uri for it (issue #816).
  describe('cleanup of the cache copy', () => {
    // Fault injection at the one point that matters: after keepLocalCopy has
    // reported success, so a copy exists on disk. localUri is read twice in
    // pickFullScreen — once to derive the cleanup directory, once to build
    // the result — so throwing on the second read stands in for any step
    // added between the copy and the return.
    function copyThenThrowOnUse(localUri: string, error: Error) {
      let reads = 0;
      return {
        status: 'success',
        get localUri() {
          reads += 1;
          if (reads > 1) throw error;
          return localUri;
        },
      };
    }

    it('deletes the copy and rethrows when a step after keepLocalCopy throws', async () => {
      const boom = new Error('post-copy-step-failed');
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([copyThenThrowOnUse(`${CACHE_DIR}/export.zip`, boom)]);
      mockDeleteAsync.mockResolvedValue(undefined);

      await expect(pickTvTimeZipFile()).rejects.toThrow('post-copy-step-failed');
      expect(mockDeleteAsync).toHaveBeenCalledWith(CACHE_DIR, { idempotent: true });
    });

    it('surfaces the original error even when the cleanup delete fails', async () => {
      const boom = new Error('post-copy-step-failed');
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([copyThenThrowOnUse(`${CACHE_DIR}/export.zip`, boom)]);
      mockDeleteAsync.mockRejectedValue(new Error('file busy'));

      await expect(pickTvTimeZipFile()).rejects.toThrow('post-copy-step-failed');
    });

    it('releasePickedDocument removes the whole per-pick directory', async () => {
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${CACHE_DIR}/export.zip` }]);
      mockDeleteAsync.mockResolvedValue(undefined);

      await releasePickedDocument(await pickTvTimeZipFile());

      expect(mockDeleteAsync).toHaveBeenCalledWith(CACHE_DIR, { idempotent: true });
    });

    it('releasePickedDocument never rejects, so callers can use it bare in a finally', async () => {
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${CACHE_DIR}/export.zip` }]);
      mockDeleteAsync.mockRejectedValue(new Error('file busy'));

      await expect(releasePickedDocument(await pickTvTimeZipFile())).resolves.toBeUndefined();
    });

    it('releasePickedDocument is a no-op on a cancelled pick', async () => {
      mockPick.mockRejectedValue(new MockNativeModuleError('OPERATION_CANCELED'));

      await releasePickedDocument(await pickTvTimeZipFile());

      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    // The delete is recursive, so climbing to a parent that isn't a per-pick
    // directory would take unrelated app state with it. Each of these falls
    // back to deleting the file alone — main's behavior, whose worst case is
    // the empty directory this PR is trying to stop leaking.
    it.each([
      ['the copy sits directly in a shared cache directory', 'file:///Library/Caches/export.zip'],
      ['the parent is named but not a UUID', 'file:///Library/Caches/DocumentPicker/export.zip'],
      ['the parent is UUID-ish but malformed', 'file:///Library/Caches/9E1F0C2A-4B7D-4F2E-9A31/export.zip'],
      ['the uri has no path separator at all', 'export.zip'],
    ])('deletes only the file when %s', async (_case, localUri) => {
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri }]);
      mockDeleteAsync.mockResolvedValue(undefined);

      const picked = await pickTvTimeZipFile();

      expect(picked).toEqual({ canceled: false, uri: localUri, cleanupUri: localUri });
      await releasePickedDocument(picked);
      expect(mockDeleteAsync).toHaveBeenCalledWith(localUri, { idempotent: true });
    });

    it('accepts a lowercase UUID directory, since the match is case-insensitive', async () => {
      const dir = 'file:///Library/Caches/9e1f0c2a-4b7d-4f2e-9a31-6c5d8e0f1a2b';
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${dir}/export.zip` }]);
      mockDeleteAsync.mockResolvedValue(undefined);

      await releasePickedDocument(await pickTvTimeZipFile());

      expect(mockDeleteAsync).toHaveBeenCalledWith(dir, { idempotent: true });
    });

    it('never rejects even if deleteAsync throws synchronously rather than rejecting', async () => {
      mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
      mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: `${CACHE_DIR}/export.zip` }]);
      mockDeleteAsync.mockImplementation(() => {
        throw new Error('native module unavailable');
      });

      await expect(releasePickedDocument(await pickTvTimeZipFile())).resolves.toBeUndefined();
    });
  });
});
