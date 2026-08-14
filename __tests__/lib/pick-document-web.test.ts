// Web: the pick is an in-memory File on a blob: uri — nothing is written to
// disk, and expo-file-system can't touch a blob: uri anyway. So a web pick
// must carry no cleanupUri, and releasePickedDocument must not attempt a
// delete. Separate file from pick-document-non-ios.test.ts because
// Platform.OS is fixed per file; the routing half (never touching
// @react-native-documents/picker off iOS) is covered there.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockDeleteAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

// Same spy-in-the-factory trick as pick-document-non-ios.test.ts: the factory
// running at all proves the native package was touched. Web is where that
// matters most — @react-native-documents/picker calls
// TurboModuleRegistry.getEnforcing at import time and react-native-web has no
// answer for it, so any require of it here is a hard crash rather than a
// degraded path.
const mockNativePickerTouched = jest.fn();
jest.mock('@react-native-documents/picker', () => {
  mockNativePickerTouched();
  return { pick: jest.fn(), keepLocalCopy: jest.fn(), isErrorWithCode: jest.fn(), errorCodes: {} };
});

import { pickTvTimeZipFile, pickLetterboxdCsvFile, releasePickedDocument } from '@/lib/pick-document';

describe('pick-document on web', () => {
  afterEach(() => {
    mockGetDocumentAsync.mockReset();
    mockDeleteAsync.mockReset();
  });

  it('hands back the in-memory File with nothing to clean up', async () => {
    const file = { name: 'export.zip' } as unknown as File;
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'blob:http://localhost/9e1f0c2a', file }],
    });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: false, uri: 'blob:http://localhost/9e1f0c2a', file, cleanupUri: undefined });
    expect(mockNativePickerTouched).not.toHaveBeenCalled();
  });

  it('releasePickedDocument never attempts a delete on a blob: uri', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'blob:http://localhost/9e1f0c2a' }],
    });

    await releasePickedDocument(await pickLetterboxdCsvFile());

    expect(mockDeleteAsync).not.toHaveBeenCalled();
    expect(mockNativePickerTouched).not.toHaveBeenCalled();
  });
});
