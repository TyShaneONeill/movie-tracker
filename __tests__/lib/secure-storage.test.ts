jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { SecureStorageAdapter } from '@/lib/secure-storage';

const mockGet = SecureStore.getItemAsync as jest.Mock;
const mockSet = SecureStore.setItemAsync as jest.Mock;
const mockDelete = SecureStore.deleteItemAsync as jest.Mock;

const CHUNK_SIZE = 2000;
const makeString = (len: number) => 'x'.repeat(len);

/**
 * Wire up mocks to an in-memory Map so setItem/getItem/removeItem
 * behave like a real key-value store across multiple calls.
 */
function useInMemoryStore() {
  const store = new Map<string, string>();
  mockGet.mockImplementation(async (key: string) => store.get(key) ?? null);
  mockSet.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  mockDelete.mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setItem
// ---------------------------------------------------------------------------
describe('SecureStorageAdapter.setItem', () => {
  it('stores a small value (<= 2000 chars) in a single key', async () => {
    // removeItem is called first internally; make its reads return null
    mockGet.mockResolvedValue(null);

    const value = makeString(CHUNK_SIZE);
    await SecureStorageAdapter.setItem('token', value);

    // Should write exactly one key with the value
    expect(mockSet).toHaveBeenCalledWith('token', value);
    // Should NOT write any chunk-count key
    expect(mockSet).not.toHaveBeenCalledWith(
      'token__chunk_count',
      expect.anything(),
      expect.anything()
    );
  });

  it.each([
    { len: 2001, expectedChunks: 2 },
    { len: 4000, expectedChunks: 2 },
    { len: 4001, expectedChunks: 3 },
    { len: 4500, expectedChunks: 3 },
    { len: 6000, expectedChunks: 3 },
    { len: 6001, expectedChunks: 4 },
  ])(
    'chunks a $len-char value into $expectedChunks chunks',
    async ({ len, expectedChunks }) => {
      mockGet.mockResolvedValue(null);

      const value = makeString(len);
      await SecureStorageAdapter.setItem('tok', value);

      // Verify chunk count stored
      expect(mockSet).toHaveBeenCalledWith(
        'tok__chunk_count',
        String(expectedChunks)
      );

      // Verify each chunk key was written
      for (let i = 0; i < expectedChunks; i++) {
        const expectedChunk = value.slice(
          i * CHUNK_SIZE,
          (i + 1) * CHUNK_SIZE
        );
        expect(mockSet).toHaveBeenCalledWith(`tok__chunk_${i}`, expectedChunk);
      }
    }
  );

  it('cleans up previous chunks before writing', async () => {
    // Simulate existing chunked data (3 chunks)
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'tok__chunk_count') return '3';
      return null;
    });

    await SecureStorageAdapter.setItem('tok', 'small');

    // removeItem should have deleted old chunks and the count key
    expect(mockDelete).toHaveBeenCalledWith('tok'); // single key cleanup
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_0');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_1');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_2');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_count');
  });
});

// ---------------------------------------------------------------------------
// getItem
// ---------------------------------------------------------------------------
describe('SecureStorageAdapter.getItem', () => {
  it('returns a small value stored in a single key', async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'tok__chunk_count') return null; // not chunked
      if (key === 'tok') return 'hello';
      return null;
    });

    const result = await SecureStorageAdapter.getItem('tok');
    expect(result).toBe('hello');
  });

  it('reassembles chunked values', async () => {
    const part0 = makeString(CHUNK_SIZE);
    const part1 = 'remainder';
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'tok__chunk_count') return '2';
      if (key === 'tok__chunk_0') return part0;
      if (key === 'tok__chunk_1') return part1;
      return null;
    });

    const result = await SecureStorageAdapter.getItem('tok');
    expect(result).toBe(part0 + part1);
  });

  it('returns null when key does not exist', async () => {
    mockGet.mockResolvedValue(null);

    const result = await SecureStorageAdapter.getItem('missing');
    expect(result).toBeNull();
  });

  it('returns null and cleans up when a chunk is missing (corruption)', async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'tok__chunk_count') return '3';
      if (key === 'tok__chunk_0') return 'aaa';
      if (key === 'tok__chunk_1') return null; // corrupted / missing
      return null;
    });

    const result = await SecureStorageAdapter.getItem('tok');

    expect(result).toBeNull();
    // removeItem should have been triggered for cleanup
    expect(mockDelete).toHaveBeenCalledWith('tok');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_count');
  });
});

// ---------------------------------------------------------------------------
// removeItem
// ---------------------------------------------------------------------------
describe('SecureStorageAdapter.removeItem', () => {
  it('removes a single-key value', async () => {
    mockGet.mockResolvedValue(null); // no chunk_count → not chunked

    await SecureStorageAdapter.removeItem('tok');

    expect(mockDelete).toHaveBeenCalledWith('tok');
    // No chunk keys should be deleted
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('removes all chunks + chunk count key when value was chunked', async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'tok__chunk_count') return '3';
      return null;
    });

    await SecureStorageAdapter.removeItem('tok');

    expect(mockDelete).toHaveBeenCalledWith('tok');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_0');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_1');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_2');
    expect(mockDelete).toHaveBeenCalledWith('tok__chunk_count');
    expect(mockDelete).toHaveBeenCalledTimes(5);
  });

  it('handles removing a key that does not exist (no errors)', async () => {
    mockGet.mockResolvedValue(null);
    mockDelete.mockResolvedValue(undefined);

    await expect(
      SecureStorageAdapter.removeItem('nonexistent')
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration-style (in-memory store) tests
// ---------------------------------------------------------------------------
describe('SecureStorageAdapter integration (in-memory store)', () => {
  it('round-trips a large value through set and get', async () => {
    useInMemoryStore();

    const bigValue = makeString(4500);
    await SecureStorageAdapter.setItem('jwt', bigValue);
    const result = await SecureStorageAdapter.getItem('jwt');

    expect(result).toBe(bigValue);
  });

  it('overwrites a chunked value with a small value and cleans up old chunks', async () => {
    const store = useInMemoryStore();

    // Write a chunked value first
    const bigValue = makeString(4500);
    await SecureStorageAdapter.setItem('tok', bigValue);
    // Confirm chunks exist
    expect(store.has('tok__chunk_count')).toBe(true);
    expect(store.has('tok__chunk_0')).toBe(true);

    // Overwrite with a small value
    const smallValue = 'tiny';
    await SecureStorageAdapter.setItem('tok', smallValue);

    // Old chunks should be gone
    expect(store.has('tok__chunk_count')).toBe(false);
    expect(store.has('tok__chunk_0')).toBe(false);
    expect(store.has('tok__chunk_1')).toBe(false);
    expect(store.has('tok__chunk_2')).toBe(false);

    // New small value readable
    const result = await SecureStorageAdapter.getItem('tok');
    expect(result).toBe(smallValue);
  });

  it('overwrites a small value with a chunked value', async () => {
    useInMemoryStore();

    await SecureStorageAdapter.setItem('tok', 'small');
    const bigValue = makeString(4500);
    await SecureStorageAdapter.setItem('tok', bigValue);

    const result = await SecureStorageAdapter.getItem('tok');
    expect(result).toBe(bigValue);
  });
});
