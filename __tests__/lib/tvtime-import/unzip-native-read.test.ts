// Native (Android/iOS) read-hardening: expo-document-picker's cache copy can
// come back missing or 0 bytes (a cloud-backed "on demand" file that hadn't
// finished downloading, or a content-provider copy that silently failed).
// Before this fix that fell through to a confusing "not a ZIP" error; now it's
// classified as file-read-failed up front, before any bytes are decoded.
// Kept in a separate file from unzip.test.ts because Platform.OS is mocked
// per-file (that suite forces 'web'; this one forces a native OS).
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  EncodingType: { Base64: 'base64' },
}));

import { unzipTvTimeExport } from '@/lib/tvtime-import/unzip';

describe('unzipTvTimeExport (native read hardening)', () => {
  afterEach(() => {
    mockGetInfoAsync.mockReset();
    mockReadAsStringAsync.mockReset();
  });

  it('throws file-read-failed when the cache copy does not exist', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    await expect(unzipTvTimeExport('file:///cache/gdpr-data.zip')).rejects.toMatchObject({
      code: 'file-read-failed',
    });
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('throws file-read-failed when the cache copy is 0 bytes', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });
    await expect(unzipTvTimeExport('file:///cache/gdpr-data.zip')).rejects.toMatchObject({
      code: 'file-read-failed',
    });
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('throws file-too-large when the cache copy exceeds the size ceiling', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 200 * 1024 * 1024 });
    await expect(unzipTvTimeExport('file:///cache/gdpr-data.zip')).rejects.toMatchObject({
      code: 'file-too-large',
    });
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('proceeds to read when the cache copy exists with a positive size', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 42 });
    mockReadAsStringAsync.mockResolvedValue(''); // empty base64 -> fails the magic-byte check next
    await expect(unzipTvTimeExport('file:///cache/gdpr-data.zip')).rejects.toMatchObject({
      code: 'not-a-zip',
    });
    expect(mockReadAsStringAsync).toHaveBeenCalled();
  });
});
