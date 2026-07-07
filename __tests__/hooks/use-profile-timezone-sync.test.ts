import { renderHook, act } from '@testing-library/react-native';

// ============================================================================
// Mocks — declared before imports (jest hoisting requirement)
// @sentry/react-native + @/lib/sentry are mocked globally in __tests__/setup.ts
// ============================================================================

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';
import { useProfileTimezoneSync } from '@/hooks/use-profile-timezone-sync';

const mockUseAuth = useAuth as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockCaptureException = captureException as jest.Mock;

function mockSelectChain(result: { data: any; error: any }) {
  const builder: any = {};
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  mockFrom.mockReturnValueOnce(builder);
  return builder;
}

function mockUpdateChain(result: { error: any }) {
  const builder: any = {};
  builder.update = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockResolvedValue(result);
  mockFrom.mockReturnValueOnce(builder);
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: 'America/New_York' }),
  } as unknown as Intl.DateTimeFormat);
});

describe('useProfileTimezoneSync', () => {
  it('does nothing when there is no user', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderHook(() => useProfileTimezoneSync());
    await act(async () => {});
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('writes the device timezone when the stored value differs', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockSelectChain({ data: { timezone: 'America/Los_Angeles' }, error: null });
    const updateBuilder = mockUpdateChain({ error: null });

    renderHook(() => useProfileTimezoneSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateBuilder.update).toHaveBeenCalledWith({ timezone: 'America/New_York' });
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('does not write when the stored value already matches the device', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockSelectChain({ data: { timezone: 'America/New_York' }, error: null });

    renderHook(() => useProfileTimezoneSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only the select call should have hit `from` — no update chain.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('only syncs once per mount (debounced to once per session)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockSelectChain({ data: { timezone: null }, error: null });
    mockUpdateChain({ error: null });

    const { rerender } = renderHook(() => useProfileTimezoneSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterFirst = mockFrom.mock.calls.length;

    rerender(undefined);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFrom.mock.calls.length).toBe(callsAfterFirst);
  });

  it('re-syncs on a same-device account switch (ref keyed by userId, not a plain boolean)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockSelectChain({ data: { timezone: null }, error: null });
    mockUpdateChain({ error: null });

    const { rerender } = renderHook(() => useProfileTimezoneSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterFirstUser = mockFrom.mock.calls.length;
    expect(callsAfterFirstUser).toBeGreaterThan(0);

    // Switch to a different user on the same device (sign out / sign in as someone else).
    mockUseAuth.mockReturnValue({ user: { id: 'user-2' } });
    mockSelectChain({ data: { timezone: null }, error: null });
    mockUpdateChain({ error: null });
    rerender(undefined);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The new user must trigger a fresh sync, not stay debounced against user-1.
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirstUser);
  });

  it('reports to Sentry when the read fails, without throwing', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockSelectChain({ data: null, error: new Error('db unavailable') });

    renderHook(() => useProfileTimezoneSync());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      { context: 'profile-timezone-sync' }
    );
  });

  it('skips entirely when Intl.DateTimeFormat throws', async () => {
    (Intl.DateTimeFormat as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('unsupported');
    });
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });

    renderHook(() => useProfileTimezoneSync());
    await act(async () => {});

    expect(mockFrom).not.toHaveBeenCalled();
  });
});
