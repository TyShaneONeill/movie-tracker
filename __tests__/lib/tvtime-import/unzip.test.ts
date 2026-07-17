import { zipSync, strToU8 } from 'fflate';

// The web read path is what this suite exercises: force Platform.OS = 'web' so
// unzipTvTimeExport takes the Blob branch (native uses expo-file-system, which
// can't read a blob: URI — the bug this fixes). FileSystem is never called on
// the web branch, so an empty mock is enough to satisfy the module import.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('expo-file-system/legacy', () => ({}));

import { unzipTvTimeExport } from '@/lib/tvtime-import/unzip';

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  return zipSync(entries);
}

// The DOM Blob type wants an ArrayBuffer-backed part; hand it the underlying
// buffer to sidestep the Uint8Array<ArrayBufferLike> generic mismatch under TS.
function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.buffer as ArrayBuffer]);
}

describe('unzipTvTimeExport (web / Blob path)', () => {
  it('reads the allowlisted CSVs from a picked File/Blob and never inflates secrets', async () => {
    const zip = makeZip({
      'tracking-prod-records-v2.csv': 'series_name,season_number\nShow,1\n',
      'auth-token.csv': 'secret,hunter2\n', // not allowlisted — must be excluded
    });
    const blob = toBlob(zip);

    const files = await unzipTvTimeExport('blob:fake-url', blob);

    expect(Object.keys(files)).toContain('tracking-prod-records-v2.csv');
    expect(files['tracking-prod-records-v2.csv']).toContain('Show');
    expect(Object.keys(files).some((n) => n.includes('auth-token'))).toBe(false);
  });

  it('rejects a non-ZIP File with a friendly message (magic-byte check runs on web)', async () => {
    const blob = toBlob(strToU8('this is not a zip at all'));
    await expect(unzipTvTimeExport('blob:fake-url', blob)).rejects.toThrow(/TV Time export ZIP/);
  });

  it('rejects an oversized file before reading its bytes', async () => {
    const huge = { size: 200 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;
    await expect(unzipTvTimeExport('blob:fake-url', huge)).rejects.toThrow(/too large/);
  });

  it('falls back to fetching the blob: URI when no File is passed', async () => {
    const zip = makeZip({ 'tracking-prod-records-v2.csv': 'series_name\nShow\n' });
    const fetchMock = jest.fn().mockResolvedValue({ blob: async () => toBlob(zip) });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    const files = await unzipTvTimeExport('blob:fake-url');

    expect(fetchMock).toHaveBeenCalledWith('blob:fake-url');
    expect(Object.keys(files)).toContain('tracking-prod-records-v2.csv');
  });
});
