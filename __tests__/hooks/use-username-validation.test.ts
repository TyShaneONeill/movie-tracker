import { renderHook, act, waitFor } from '@testing-library/react-native';
import { mockSupabaseQuery } from '../fixtures';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  useUsernameValidation,
  getFormatError,
  checkAvailability,
  DEBOUNCE_DELAY,
} from '@/hooks/use-username-validation';
import { supabase } from '@/lib/supabase';

const mockFrom = supabase.from as jest.Mock;

// ============================================================================
// Helpers
// ============================================================================

const CURRENT_USER_ID = 'user-abc-123';

/**
 * Sets up the supabase mock chain for availability checks.
 * @param available - true if the username should be available (no matching user found)
 */
function setupAvailabilityMock(available: boolean) {
  const chain = mockSupabaseQuery({
    data: available ? null : { id: 'other-user-id' },
    error: null,
  });
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ============================================================================
// Tests: getFormatError
// ============================================================================

describe('getFormatError', () => {
  it('returns null for empty string', () => {
    expect(getFormatError('')).toBeNull();
  });

  it('returns null for valid usernames', () => {
    const validNames = ['abc', 'user_123', 'a_b_c_d_e_f_g_h_i_j', 'hello', 'test99'];
    for (const name of validNames) {
      expect(getFormatError(name)).toBeNull();
    }
  });

  it('returns error for too short username (1 char)', () => {
    expect(getFormatError('a')).toBe('Must be at least 3 characters');
  });

  it('returns error for too short username (2 chars)', () => {
    expect(getFormatError('ab')).toBe('Must be at least 3 characters');
  });

  it('returns error for too long username (>20 chars)', () => {
    const longName = 'a'.repeat(21);
    expect(getFormatError(longName)).toBe('Must be at most 20 characters');
  });

  it('returns error for uppercase letters', () => {
    expect(getFormatError('Hello')).toBe('Only lowercase letters, numbers, and underscores');
  });

  it('returns error for spaces', () => {
    expect(getFormatError('user name')).toBe('Only lowercase letters, numbers, and underscores');
  });

  it('returns error for special characters', () => {
    const specialNames = ['user@name', 'user-name', 'user.name', 'user!name'];
    for (const name of specialNames) {
      expect(getFormatError(name)).toBe('Only lowercase letters, numbers, and underscores');
    }
  });

  it('returns length error before pattern error for short invalid names', () => {
    // "A!" is 2 chars - length check comes first
    expect(getFormatError('A!')).toBe('Must be at least 3 characters');
  });
});

// ============================================================================
// Tests: checkAvailability
// ============================================================================

describe('checkAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when no matching user found (data === null)', async () => {
    setupAvailabilityMock(true);

    const result = await checkAvailability('newuser', CURRENT_USER_ID);
    expect(result).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('profiles');
  });

  it('returns false when a matching user exists', async () => {
    setupAvailabilityMock(false);

    const result = await checkAvailability('takenuser', CURRENT_USER_ID);
    expect(result).toBe(false);
  });

  it('queries with the correct username and excludes current user', async () => {
    const chain = setupAvailabilityMock(true);

    await checkAvailability('testuser', CURRENT_USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(chain.select).toHaveBeenCalledWith('id');
    expect(chain.eq).toHaveBeenCalledWith('username', 'testuser');
    expect(chain.neq).toHaveBeenCalledWith('id', CURRENT_USER_ID);
    expect(chain.maybeSingle).toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: useUsernameValidation hook
// ============================================================================

describe('useUsernameValidation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns idle status when username is empty', () => {
    const { result } = renderHook(() => useUsernameValidation('', CURRENT_USER_ID));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('returns invalid status with error for too-short username', () => {
    const { result } = renderHook(() => useUsernameValidation('ab', CURRENT_USER_ID));

    expect(result.current.status).toBe('invalid');
    expect(result.current.error).toBe('Must be at least 3 characters');
  });

  it('returns invalid status for invalid characters', () => {
    const { result } = renderHook(() => useUsernameValidation('Hello', CURRENT_USER_ID));

    expect(result.current.status).toBe('invalid');
    expect(result.current.error).toBe('Only lowercase letters, numbers, and underscores');
  });

  it('returns checking status while debounce is pending', () => {
    setupAvailabilityMock(true);

    const { result } = renderHook(() => useUsernameValidation('validuser', CURRENT_USER_ID));

    // Before debounce fires, username !== debouncedUsername, so status is 'checking'
    expect(result.current.status).toBe('checking');
    expect(result.current.error).toBeNull();
  });

  it('returns available status after successful availability check', async () => {
    setupAvailabilityMock(true);

    const { result } = renderHook(() => useUsernameValidation('validuser', CURRENT_USER_ID));

    // Advance past debounce delay
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('available');
    });
    expect(result.current.error).toBeNull();
  });

  it('returns taken status when username is taken', async () => {
    setupAvailabilityMock(false);

    const { result } = renderHook(() => useUsernameValidation('takenuser', CURRENT_USER_ID));

    // Advance past debounce delay
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('taken');
    });
    expect(result.current.error).toBe('Username is already taken');
  });

  it('does not check availability when format is invalid', async () => {
    setupAvailabilityMock(true);

    renderHook(() => useUsernameValidation('ab', CURRENT_USER_ID));

    // Advance past debounce delay
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    // Should never have queried supabase
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not check availability when currentUserId is undefined', async () => {
    setupAvailabilityMock(true);

    const { result } = renderHook(() => useUsernameValidation('validuser', undefined));

    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    // The effect should bail out when currentUserId is undefined
    expect(mockFrom).not.toHaveBeenCalled();
    // Status should be 'idle' since availability check was skipped
    // But format is valid and debounce has fired, so availabilityStatus stays 'idle'
    expect(result.current.status).toBe('idle');
  });

  it('aborts stale checks when username changes quickly', async () => {
    // First setup returns 'taken' (but should be aborted)
    const staleChain = mockSupabaseQuery({
      data: { id: 'other-user' },
      error: null,
    });

    // Track calls to differentiate between stale and fresh
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call (stale) - return taken with a delay
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              neq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { id: 'other-user' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      // Second call (fresh) - return available
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            neq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      };
    });

    const { result, rerender } = renderHook(
      ({ username }: { username: string }) => useUsernameValidation(username, CURRENT_USER_ID),
      { initialProps: { username: 'first' } }
    );

    // Let the first debounce fire
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    // Quickly change to a new username before the first result resolves
    rerender({ username: 'second' });

    // Let the second debounce fire
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    // The final result should reflect the second username's availability
    await waitFor(() => {
      expect(result.current.status).toBe('available');
    });
  });

  it('transitions from checking to available through debounce cycle', async () => {
    // Use a delayed mock so that 'checking' persists after debounce fires
    let resolveAvailability: (value: { data: null; error: null }) => void;
    const delayedPromise = new Promise<{ data: null; error: null }>((resolve) => {
      resolveAvailability = resolve;
    });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          neq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockReturnValue(delayedPromise),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useUsernameValidation('testuser', CURRENT_USER_ID));

    // Initially checking (debounce hasn't fired)
    expect(result.current.status).toBe('checking');

    // Advance past debounce - effect fires, but the supabase query hasn't resolved yet
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });
    expect(result.current.status).toBe('checking');

    // Now resolve the availability check
    await act(async () => {
      resolveAvailability!({ data: null, error: null });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('available');
    });
  });

  it('resets to idle when username is cleared', async () => {
    setupAvailabilityMock(true);

    const { result, rerender } = renderHook(
      ({ username }: { username: string }) => useUsernameValidation(username, CURRENT_USER_ID),
      { initialProps: { username: 'validuser' } }
    );

    // Let debounce fire and check complete
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_DELAY);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('available');
    });

    // Clear the username
    rerender({ username: '' });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
