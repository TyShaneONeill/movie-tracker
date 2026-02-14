import * as SecureStore from 'expo-secure-store';

/**
 * Maximum bytes SecureStore allows per key (iOS Keychain / Android Keystore limit).
 * We use a conservative limit to leave room for encoding overhead.
 */
const CHUNK_SIZE = 2000;

/** Suffix used for the key that stores the chunk count */
const CHUNK_COUNT_SUFFIX = '__chunk_count';

/** Build the key for a specific chunk index */
function chunkKey(base: string, index: number): string {
  return `${base}__chunk_${index}`;
}

/**
 * OS-level encrypted storage adapter for Supabase auth tokens.
 *
 * Handles SecureStore's 2048-byte-per-key limit by transparently chunking
 * large values (e.g. JWTs with extensive claims) across multiple keys.
 *
 * Small values (≤ CHUNK_SIZE) are stored in a single key with no overhead.
 */
export const SecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    // Check if this value was chunked
    const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);

    if (countStr === null) {
      // Not chunked — try single key
      return SecureStore.getItemAsync(key);
    }

    // Reassemble chunks
    const count = parseInt(countStr, 10);
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk === null) {
        // Corrupted — a chunk is missing. Clear everything and return null.
        await SecureStorageAdapter.removeItem(key);
        return null;
      }
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clean up any previous chunks before writing
    await SecureStorageAdapter.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      // Fits in a single key — no chunking needed
      await SecureStore.setItemAsync(key, value);
      return;
    }

    // Split into chunks
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Write all chunks + count
    await Promise.all(
      chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk))
    );
    await SecureStore.setItemAsync(
      `${key}${CHUNK_COUNT_SUFFIX}`,
      String(chunks.length)
    );
  },

  async removeItem(key: string): Promise<void> {
    // Remove the single-key value (may or may not exist)
    await SecureStore.deleteItemAsync(key);

    // Check for and remove any chunks
    const countStr = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (countStr !== null) {
      const count = parseInt(countStr, 10);
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKey(key, i))
        )
      );
      await SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    }
  },
};
