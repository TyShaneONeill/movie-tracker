import { supabase } from './supabase';

export interface BugReportClientPayload {
  title: string;
  description: string;
  screenshot_base64: string | null;
  platform: 'ios' | 'web';
  app_version: string;
  route: string;
  device: { model: string; os: string; os_version: string } | null;
}

export type SubmitResult =
  | { kind: 'ok' }
  | { kind: 'rate_limited'; retryAfterSeconds?: number }
  | { kind: 'validation_error'; field: string }
  | { kind: 'payload_too_large' }
  | { kind: 'unauthenticated' }
  | { kind: 'network_error' }
  | { kind: 'server_error' };

const ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/submit-bug-report`;

export async function submitBugReport(payload: BugReportClientPayload): Promise<SubmitResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { kind: 'unauthenticated' };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 200) return { kind: 'ok' };
    if (res.status === 401) return { kind: 'unauthenticated' };
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After') ?? '');
      return { kind: 'rate_limited', retryAfterSeconds: Number.isFinite(retry) ? retry : undefined };
    }
    if (res.status === 413) return { kind: 'payload_too_large' };
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      return { kind: 'validation_error', field: body.field ?? 'unknown' };
    }
    return { kind: 'server_error' };
  } catch {
    return { kind: 'network_error' };
  }
}
