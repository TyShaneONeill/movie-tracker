import { validateBugReportPayload } from '../../supabase/functions/_shared/bug-report-validate';

const valid = {
  title: 'ok',
  description: 'did a thing',
  screenshot_base64: null,
  platform: 'ios',
  app_version: '1.2.0',
  route: '/feed',
  device: { model: 'iPhone15,3', os: 'iOS', os_version: '17.4' },
};

describe('validateBugReportPayload', () => {
  it('accepts a valid payload', () => {
    const r = validateBugReportPayload(valid);
    expect(r.ok).toBe(true);
  });

  it('rejects title > 100', () => {
    const r = validateBugReportPayload({ ...valid, title: 'x'.repeat(101) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe('title');
      expect(r.reason).toMatch(/length/i);
    }
  });

  it('rejects description > 500', () => {
    const r = validateBugReportPayload({ ...valid, description: 'x'.repeat(501) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('description');
  });

  it('rejects empty title', () => {
    const r = validateBugReportPayload({ ...valid, title: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('title');
  });

  it('rejects empty description', () => {
    const r = validateBugReportPayload({ ...valid, description: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('description');
  });

  it('rejects invalid platform', () => {
    const r = validateBugReportPayload({ ...valid, platform: 'android' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('platform');
  });

  it('rejects malformed app_version', () => {
    const r = validateBugReportPayload({ ...valid, app_version: 'dev' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('app_version');
  });

  it('allows null device on web', () => {
    const r = validateBugReportPayload({ ...valid, platform: 'web', device: null });
    expect(r.ok).toBe(true);
  });

  it('rejects control chars in title', () => {
    const r = validateBugReportPayload({ ...valid, title: 'ab\x00cd' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('title');
  });

  it('rejects screenshot_base64 over 2MB', () => {
    // ~2.1 MB of decoded bytes ≈ 2.8 MB of base64
    const bigB64 = 'A'.repeat(3_000_000);
    const r = validateBugReportPayload({ ...valid, screenshot_base64: bigB64 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('screenshot_base64');
  });

  it('accepts screenshot_base64 under 2MB', () => {
    const smallB64 = 'A'.repeat(100_000); // ~75 KB decoded
    const r = validateBugReportPayload({ ...valid, screenshot_base64: smallB64 });
    expect(r.ok).toBe(true);
  });
});
