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

import { pickTvTimeZipFile, pickLetterboxdCsvFile } from '@/lib/pick-document';

describe('pick-document on iOS with the native picker available', () => {
  afterEach(() => {
    mockPick.mockReset();
    mockKeepLocalCopy.mockReset();
    mockGetDocumentAsync.mockReset();
  });

  it('pickTvTimeZipFile presents fullScreen with zip + allFiles UTIs and returns the cached uri', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/export.zip', name: 'export.zip' }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: 'file:///cache/export.zip' }]);

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: false, uri: 'file:///cache/export.zip' });
    expect(mockPick).toHaveBeenCalledWith({ type: ['public.zip-archive', 'public.item'], presentationStyle: 'fullScreen' });
    expect(mockKeepLocalCopy).toHaveBeenCalledWith({
      files: [{ uri: 'file:///picked/export.zip', fileName: 'export.zip' }],
      destination: 'cachesDirectory',
    });
    expect(mockGetDocumentAsync).not.toHaveBeenCalled();
  });

  it('pickLetterboxdCsvFile presents fullScreen with csv + allFiles UTIs and returns the cached uri', async () => {
    mockPick.mockResolvedValue([{ uri: 'file:///picked/watched.csv', name: null }]);
    mockKeepLocalCopy.mockResolvedValue([{ status: 'success', localUri: 'file:///cache/watched.csv' }]);

    const result = await pickLetterboxdCsvFile();

    expect(result).toEqual({ canceled: false, uri: 'file:///cache/watched.csv' });
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
  });

  it('guards against pick() resolving with an empty array', async () => {
    mockPick.mockResolvedValue([]);

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: true });
    expect(mockKeepLocalCopy).not.toHaveBeenCalled();
  });
});
