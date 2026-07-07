/**
 * Error classification for the scan-ticket flow (2026-07-01 billing-lapse
 * incident): a 503/service_unavailable from the edge function must be
 * classified as OUR outage (scan refunded), never as the user's photo or a
 * rate limit — and the server's post-refund scansRemaining must ride along on
 * the thrown error so the UI count can't go stale.
 */
import { renderHook, act } from '@testing-library/react-native';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

const mockInvoke = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: jest.fn(),
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
    identify: jest.fn(),
    reset: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: null }),
}));

jest.mock('@/lib/notification-priming-context', () => ({
  useNotificationPriming: () => ({ triggerFirstWinCheck: jest.fn() }),
}));

import { useScanTicket, ScanTicketError, isScanTicketError } from '@/hooks/use-scan-ticket';

function sessionOk() {
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    },
    error: null,
  });
}

/** Shape supabase-js FunctionsHttpError enough for the hook's body parsing. */
function fnHttpError(status: number, body: Record<string, unknown>) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    status,
    context: { status, json: async () => body },
  };
}

async function scanAndCatch(): Promise<unknown> {
  const { result } = renderHook(() => useScanTicket());
  let caught: unknown = null;
  await act(async () => {
    try {
      await result.current.scanTicket('base64data', 'image/jpeg');
    } catch (e) {
      caught = e;
    }
  });
  return caught;
}

describe('useScanTicket error classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionOk();
  });

  it('classifies 503 + errorCode as service_unavailable and carries the refunded count', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: fnHttpError(503, {
        success: false,
        errorCode: 'service_unavailable',
        error: "Ticket scanning is temporarily unavailable — your scan wasn't used.",
        scansRemaining: 3,
      }),
    });

    const caught = await scanAndCatch();
    expect(isScanTicketError(caught)).toBe(true);
    const err = caught as ScanTicketError;
    expect(err.type).toBe('service_unavailable');
    expect(err.scansRemaining).toBe(3);
    expect(mockTrack).toHaveBeenCalledWith('scan:fail', { reason: 'service_unavailable' });
  });

  it('does NOT misread a service failure with scansRemaining 0 as a rate limit', async () => {
    // A failed refund can leave scansRemaining at 0 on a 503 body — the old
    // ordering matched `scansRemaining === 0` first and showed "limit reached".
    mockInvoke.mockResolvedValue({
      data: null,
      error: fnHttpError(503, {
        success: false,
        errorCode: 'service_unavailable',
        error: 'Ticket scanning is temporarily unavailable.',
        scansRemaining: 0,
      }),
    });

    const caught = await scanAndCatch();
    const err = caught as ScanTicketError;
    expect(err.type).toBe('service_unavailable');
    expect(err.scansRemaining).toBe(0);
  });

  it('still classifies a genuine 429 as rate_limit with scansRemaining 0', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: fnHttpError(429, {
        success: false,
        error: 'Daily scan limit reached',
        scansRemaining: 0,
        dailyLimit: 3,
      }),
    });

    const caught = await scanAndCatch();
    const err = caught as ScanTicketError;
    expect(err.type).toBe('rate_limit');
    expect(err.scansRemaining).toBe(0);
    expect(mockTrack).toHaveBeenCalledWith('scan:fail', { reason: 'rate_limit' });
  });

  it('classifies a 422 as extraction_failed', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: fnHttpError(422, {
        success: false,
        error: 'Failed to extract ticket information.',
        scansRemaining: 2,
      }),
    });

    const caught = await scanAndCatch();
    const err = caught as ScanTicketError;
    expect(err.type).toBe('extraction_failed');
    expect(err.scansRemaining).toBe(2);
  });
});
