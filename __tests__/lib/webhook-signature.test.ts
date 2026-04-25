// __tests__/lib/webhook-signature.test.ts
import { verifySentryWebhookSignature } from '../../supabase/functions/_shared/webhook-signature';
import { createHmac } from 'crypto';

describe('verifySentryWebhookSignature', () => {
  const secret = 'abc123';
  const body = '{"foo":"bar"}';
  const validSig = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature', async () => {
    expect(await verifySentryWebhookSignature(body, validSig, secret)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    expect(await verifySentryWebhookSignature(body + 'tampered', validSig, secret))
      .toBe(false);
  });

  it('rejects a wrong secret', async () => {
    expect(await verifySentryWebhookSignature(body, validSig, 'different-secret'))
      .toBe(false);
  });

  it('rejects empty or malformed sig', async () => {
    expect(await verifySentryWebhookSignature(body, '', secret)).toBe(false);
    expect(await verifySentryWebhookSignature(body, 'abc', secret)).toBe(false);
  });
});
