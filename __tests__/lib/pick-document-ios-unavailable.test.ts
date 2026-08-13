// iOS + native module ABSENT — the OTA-old-binary scenario (#815 review,
// HIGH-3): a JS update can land on a binary built before
// @react-native-documents/picker was added, so `require()`-ing it throws
// (TurboModuleRegistry.getEnforcing on an unregistered module). This proves
// pickTvTimeZipFile / pickLetterboxdCsvFile degrade to the legacy
// expo-document-picker path instead of throwing — reintroducing the #810
// freeze risk on affected devices only, which is strictly better than a
// dead screen. Separate file from pick-document-ios-available.test.ts
// because the @react-native-documents/picker mock differs per file.
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const mockGetDocumentAsync = jest.fn();
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args),
}));

// Simulates require('@react-native-documents/picker') throwing because the
// native module was never registered in this binary.
jest.mock('@react-native-documents/picker', () => {
  throw new Error('Native module RNDocumentPicker is not registered');
});

import { pickTvTimeZipFile, pickLetterboxdCsvFile } from '@/lib/pick-document';

describe('pick-document on iOS with the native picker unavailable (pre-#815 binary)', () => {
  afterEach(() => {
    mockGetDocumentAsync.mockReset();
  });

  it('pickTvTimeZipFile falls back to expo-document-picker instead of throwing', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/export.zip', file: undefined }],
    });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: false, uri: 'file:///picked/export.zip', file: undefined });
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
  });

  it('pickLetterboxdCsvFile falls back to expo-document-picker instead of throwing', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked/watched.csv' }],
    });

    const result = await pickLetterboxdCsvFile();

    expect(result).toEqual({ canceled: false, uri: 'file:///picked/watched.csv', file: undefined });
  });

  it('a user cancel on the fallback picker is still a clean cancel', async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

    const result = await pickTvTimeZipFile();

    expect(result).toEqual({ canceled: true });
  });
});
