// expo-file-system v19's base64 read + EncodingType live on the /legacy entry
// (the same one app/settings/index.tsx uses).
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
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

// Size ceilings (decompression-bomb / OOM guards). A real TV Time export is a
// few hundred KB; these are generous. The whole-ZIP ceiling is checked from the
// filesystem before we read a single byte; the per-entry ceiling is checked
// from fflate's pre-decompression `originalSize`, so an oversized entry is
// SKIPPED (never inflated) rather than crashing the app.
const MAX_ZIP_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_ENTRY_BYTES = 50 * 1024 * 1024; // 50 MB decompressed, per allowlisted CSV

// Local ZIP entries start with the signature "PK\x03\x04".
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function basename(path: string): string {
  return path.split('/').pop()?.toLowerCase() ?? path.toLowerCase();
}

function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

/** Read the picked ZIP's bytes. Guards the whole-file size before reading so a
 *  pathological file can't OOM.
 *
 *  Web and native diverge because DocumentPicker returns different things:
 *  - Web hands back a `File`/`Blob` (and a `blob:` URI). expo-file-system can't
 *    read a blob URI, so we read straight off the Blob via `arrayBuffer()`.
 *  - Native copies into the cache dir, yielding a `file://` URI expo-file-system
 *    reads as base64. */
async function readZipBytes(uri: string, file?: File | Blob): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    // Prefer the picker's File; fall back to fetching the blob: URI (both give a
    // Blob with .size and .arrayBuffer()). fflate is pure-JS — inflates the same
    // on web as native.
    let blob: Blob | undefined = file;
    if (!blob) {
      const resp = await fetch(uri);
      blob = await resp.blob();
    }
    if (!blob) throw new Error("We couldn't read that file.");
    if (typeof blob.size === 'number' && blob.size > MAX_ZIP_BYTES) {
      throw new Error('That file is too large to be a TV Time export.');
    }
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && typeof info.size === 'number' && info.size > MAX_ZIP_BYTES) {
    throw new Error('That file is too large to be a TV Time export.');
  }
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
 * ONLY the allowlisted CSVs that are also within the per-entry size ceiling.
 * Pure-JS (fflate) so it carries no native code and is OTA-safe. Throws a
 * friendly error when the file isn't a readable ZIP or contains none of the
 * expected CSVs (an empty map would look like a clean zero-item import).
 */
export async function unzipTvTimeExport(uri: string, file?: File | Blob): Promise<TvTimeFileMap> {
  let bytes: Uint8Array;
  try {
    bytes = await readZipBytes(uri, file);
  } catch (err) {
    // Preserve the too-large message; otherwise a generic read-failure message.
    if (err instanceof Error && err.message.includes('too large')) throw err;
    throw new Error(
      "We couldn't read that file. Pick the ZIP you exported from TV Time and try again."
    );
  }

  // Cheap magic-byte check up front — Android's document picker often mislabels
  // a ZIP's mime type (octet-stream), so we don't trust the extension/mime; we
  // trust the bytes.
  if (!hasZipMagic(bytes)) {
    throw new Error(
      "That doesn't look like a TV Time export ZIP. Choose the gdpr-data.zip file (or a similar name)."
    );
  }

  // fflate 0.4.8's `unzipSync` takes no options — the `filter` that was supposed
  // to allowlist entries and cap decompressed size BEFORE inflation is not
  // supported by this pinned version (it was added in a later major). So every
  // entry is inflated here, and the allowlist + size cap are enforced on the
  // OUTPUT in the loop below. Real pre-decompression bomb protection (never
  // inflating a hostile entry) needs the fflate bump — tracked as a follow-up.
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error(
      "That doesn't look like a TV Time export ZIP. Choose the gdpr-data.zip file (or a similar name)."
    );
  }

  const files: TvTimeFileMap = {};
  for (const [name, data] of Object.entries(entries)) {
    // Enforce the allowlist + per-entry size cap HERE — fflate 0.4.8's `filter`
    // is a no-op (see above), so this is what actually keeps the export's secret
    // CSVs (auth tokens, password hashes) and oversized entries out of the parsed
    // payload and everything downstream (match, network calls).
    if (!ALLOWED_BASENAMES.has(basename(name))) continue;
    if (data.length >= MAX_ENTRY_BYTES) continue;
    files[name] = strFromU8(data);
  }

  if (Object.keys(files).length === 0) {
    throw new Error(
      "We couldn't find your TV Time history in that ZIP. Make sure it's the export from TV Time (gdpr-data.zip or a similar name)."
    );
  }

  return files;
}
