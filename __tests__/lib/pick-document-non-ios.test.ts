// Android/web: pickTvTimeZipFile / pickLetterboxdCsvFile must go straight to
// expo-document-picker and never touch @react-native-documents/picker — a
// static or unconditional require of that package crashes react-native-web
// (no TurboModuleRegistry) per the #815 review (HIGH-1). Tested against
// Platform.OS:'android' since Android and web share the exact same
// `if (Platform.OS === 'ios')`-false branch in lib/pick-document.ts; there
// is no OS-specific behavior for either beyond that shared gate.
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
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

import { pickTvTimeZipFile, pickLetterboxdCsvFile } from '@/lib/pick-document';

describe('pick-document on Android (representative of non-iOS platforms)', () => {
  afterEach(() => {
    mockGetDocumentAsync.mockReset();
  });

  it('pickTvTimeZipFile uses expo-document-picker and never touches the native picker', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://picked/export.zip', file: undefined }],
    });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: false, uri: 'content://picked/export.zip', file: undefined });
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

    expect(result).toEqual({ canceled: false, uri: 'content://picked/watched.csv', file: undefined });
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
});
