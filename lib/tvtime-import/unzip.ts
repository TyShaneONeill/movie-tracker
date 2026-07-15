// expo-file-system v19's base64 read + EncodingType live on the /legacy entry
// (the same one app/settings/index.tsx uses).
import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync, strFromU8 } from 'fflate';
import type { TvTimeFileMap } from './types';

// TV Time's GDPR export is a ZIP that also contains files with auth tokens and
// password hashes. We NEVER decompress or read those: fflate's `filter` runs
// before decompression, so only the allowlisted CSVs are ever inflated into
// memory. Nothing is extracted to disk. (PII hygiene, per PR #681 review.)
const ALLOWED_BASENAMES = new Set([
  'tracking-prod-records-v2.csv', // shows + episodes
  'tracking-prod-records.csv', // movies (older format)
  'user_tv_show_data.csv', // favorites crosscheck
]);

function basename(path: string): string {
  return path.split('/').pop()?.toLowerCase() ?? path.toLowerCase();
}

/** Read the picked ZIP's bytes. DocumentPicker copies into the cache dir by
 *  default, yielding a `file://` URI expo-file-system can read as base64. */
async function readZipBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(base64);
}

function base64ToBytes(base64: string): Uint8Array {
  // atob exists in the Hermes/RN runtime; decode without pulling Buffer.
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Unzip a picked TV Time export into a { filename -> CSV content } map, reading
 * ONLY the allowlisted CSVs. Pure-JS (fflate) so it carries no native code and
 * is OTA-safe. Throws a friendly error when the file isn't a readable ZIP or
 * contains none of the expected CSVs (an empty map would look like a clean
 * zero-item import, which it isn't).
 */
export async function unzipTvTimeExport(uri: string): Promise<TvTimeFileMap> {
  let bytes: Uint8Array;
  try {
    bytes = await readZipBytes(uri);
  } catch {
    throw new Error(
      "We couldn't read that file. Pick the ZIP you exported from TV Time and try again."
    );
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => ALLOWED_BASENAMES.has(basename(file.name)),
    });
  } catch {
    throw new Error(
      "That doesn't look like a TV Time export ZIP. Choose the gdpr-data.zip file (or a similar name)."
    );
  }

  const files: TvTimeFileMap = {};
  for (const [name, data] of Object.entries(entries)) {
    files[name] = strFromU8(data);
  }

  if (Object.keys(files).length === 0) {
    throw new Error(
      "We couldn't find your TV Time history in that ZIP. Make sure it's the export from TV Time (gdpr-data.zip or a similar name)."
    );
  }

  return files;
}
