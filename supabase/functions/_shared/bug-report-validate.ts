/**
 * Server-side payload validation for bug-report submissions.
 * Returns a discriminated union so the handler can produce field-specific
 * 400 responses.
 *
 * NOTE: this validates *shape and limits* only. sanitize + PII scrub are
 * applied after validation by the handler.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const APP_VERSION_RE = /^\d+\.\d+\.\d+/;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2 MB decoded

export type ValidationResult =
  | { ok: true; payload: BugReportPayload }
  | { ok: false; field: string; reason: string };

export interface BugReportPayload {
  title: string;
  description: string;
  screenshot_base64: string | null;
  platform: 'ios' | 'web';
  app_version: string;
  route: string;
  device: { model: string; os: string; os_version: string } | null;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function approxDecodedBytes(b64: string): number {
  // Fast approximation: every 4 base64 chars → 3 decoded bytes (±padding).
  return Math.floor((b64.length * 3) / 4);
}

export function validateBugReportPayload(raw: unknown): ValidationResult {
  if (!isObject(raw)) return { ok: false, field: '_root', reason: 'not an object' };

  const title = raw.title;
  if (typeof title !== 'string') return { ok: false, field: 'title', reason: 'must be string' };
  if (title.trim().length === 0)
    return { ok: false, field: 'title', reason: 'must not be empty' };
  if (title.length > 100)
    return { ok: false, field: 'title', reason: 'length must be <= 100' };
  if (CONTROL_CHAR_RE.test(title))
    return { ok: false, field: 'title', reason: 'contains forbidden control chars' };

  const description = raw.description;
  if (typeof description !== 'string')
    return { ok: false, field: 'description', reason: 'must be string' };
  if (description.trim().length === 0)
    return { ok: false, field: 'description', reason: 'must not be empty' };
  if (description.length > 500)
    return { ok: false, field: 'description', reason: 'length must be <= 500' };
  if (CONTROL_CHAR_RE.test(description))
    return { ok: false, field: 'description', reason: 'contains forbidden control chars' };

  const platform = raw.platform;
  if (platform !== 'ios' && platform !== 'web')
    return { ok: false, field: 'platform', reason: 'must be "ios" or "web"' };

  const app_version = raw.app_version;
  if (typeof app_version !== 'string' || !APP_VERSION_RE.test(app_version))
    return { ok: false, field: 'app_version', reason: 'must match /^\\d+\\.\\d+\\.\\d+/' };

  const route = raw.route;
  if (typeof route !== 'string' || route.length === 0 || route.length > 200)
    return { ok: false, field: 'route', reason: 'must be non-empty string <= 200' };

  const screenshot_base64 = raw.screenshot_base64;
  if (screenshot_base64 !== null) {
    if (typeof screenshot_base64 !== 'string')
      return { ok: false, field: 'screenshot_base64', reason: 'must be string or null' };
    if (approxDecodedBytes(screenshot_base64) > MAX_SCREENSHOT_BYTES)
      return {
        ok: false,
        field: 'screenshot_base64',
        reason: 'decoded size exceeds 2 MB',
      };
  }

  const device = raw.device;
  if (platform === 'web') {
    if (device !== null)
      return { ok: false, field: 'device', reason: 'must be null on web' };
  } else {
    if (!isObject(device))
      return { ok: false, field: 'device', reason: 'required on ios' };
    if (typeof device.model !== 'string' || typeof device.os !== 'string' || typeof device.os_version !== 'string')
      return { ok: false, field: 'device', reason: 'model/os/os_version must be strings' };
  }

  return {
    ok: true,
    payload: {
      title,
      description,
      screenshot_base64: screenshot_base64 as string | null,
      platform,
      app_version,
      route,
      device: device as BugReportPayload['device'],
    },
  };
}
