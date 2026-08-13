// Android/web: pickTvTimeZipFile / pickLetterboxdCsvFile must go straight to
// expo-document-picker and never touch @react-native-documents/picker — a
// static or unconditional require of that package crashes react-native-web
// (no TurboModuleRegistry) per the #815 review (HIGH-1). Tested against
// Platform.OS:'android' since Android and web take the same
// `if (Platform.OS === 'ios')`-false branch in lib/pick-document.ts. They
// diverge only on cleanup — web has no on-disk copy to delete — which
// pick-document-web.test.ts covers.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

const mockDeleteAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

// A jest.fn() spy inside the mock factory, rather than just letting the
// module resolve normally: if a regression ever removes the
// Platform.OS==='ios' gate, this factory running at all proves the native
// picker was touched on a non-iOS platform, which is the exact crash this
// suite guards against.
const mockNativePickerTouched = jest.fn();
jest.mock('@react-native-documents/picker', () => {
  mockNativePickerTouched();
  return {
    pick: jest.fn(),
    keepLocalCopy: jest.fn(),
    isErrorWithCode: jest.fn(),
    errorCodes: {},
  };
});

import { pickTvTimeZipFile, pickLetterboxdCsvFile, releasePickedDocument } from '@/lib/pick-document';

describe('pick-document on Android (representative of non-iOS platforms)', () => {
  afterEach(() => {
    mockGetDocumentAsync.mockReset();
    mockDeleteAsync.mockReset();
  });

  it('pickTvTimeZipFile uses expo-document-picker and never touches the native picker', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://picked/export.zip', file: undefined }],
    });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({
      canceled: false,
      uri: 'content://picked/export.zip',
      file: undefined,
      // expo-document-picker's cache directory is shared across picks, so the
      // file itself is the cleanup target here — not its parent, unlike the
      // per-pick directory the iOS native picker creates.
      cleanupUri: 'content://picked/export.zip',
    });
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    expect(mockNativePickerTouched).not.toHaveBeenCalled();
  });

  it('pickLetterboxdCsvFile uses expo-document-picker and never touches the native picker', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://picked/watched.csv' }],
    });

    const result = await pickLetterboxdCsvFile();

    expect(result).toEqual({
      canceled: false,
      uri: 'content://picked/watched.csv',
      file: undefined,
      cleanupUri: 'content://picked/watched.csv',
    });
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    expect(mockNativePickerTouched).not.toHaveBeenCalled();
  });

  it('a user cancel is a clean cancel, still never touching the native picker', async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: true });
    expect(mockNativePickerTouched).not.toHaveBeenCalled();
  });

  it('releasePickedDocument deletes the legacy cache copy itself, not its shared parent', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://picked/export.zip', file: undefined }],
    });
    mockDeleteAsync.mockResolvedValue(undefined);

    await releasePickedDocument(await pickTvTimeZipFile());

    expect(mockDeleteAsync).toHaveBeenCalledWith('content://picked/export.zip', { idempotent: true });
  });
});
