import { submitBugReport } from '../../lib/bug-report-client';

const mockSession = { access_token: 'jwt-abc' };

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession } })),
    },
  },
}));

describe('submitBugReport', () => {
  const basePayload = {
    title: 'crash',
    description: 'on tap',
    screenshot_base64: null,
    platform: 'ios' as const,
    app_version: '1.2.0',
    route: '/feed',
    device: { model: 'iPhone', os: 'iOS', os_version: '17.4' },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns success on 200', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;
    const result = await submitBugReport(basePayload);
    expect(result.kind).toBe('ok');
  });

  it('returns rate_limited on 429', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: (k: string) => (k === 'Retry-After' ? '3600' : null) },
      json: async () => ({ error: 'rate_limited' }),
    })) as unknown as typeof fetch;
    const result = await submitBugReport(basePayload);
    expect(result.kind).toBe('rate_limited');
  });

  it('returns validation_error on 400', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'validation_failed', field: 'title' }),
    })) as unknown as typeof fetch;
    const result = await submitBugReport(basePayload);
    expect(result.kind).toBe('validation_error');
  });

  it('returns payload_too_large on 413', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 413,
      json: async () => ({ error: 'validation_failed', field: 'screenshot_base64' }),
    })) as unknown as typeof fetch;
    const result = await submitBugReport(basePayload);
    expect(result.kind).toBe('payload_too_large');
  });

  it('returns network_error on thrown fetch', async () => {
    global.fetch = jest.fn(async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    const result = await submitBugReport(basePayload);
    expect(result.kind).toBe('network_error');
  });
});
