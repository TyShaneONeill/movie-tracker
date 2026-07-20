import {
  computeGrantExpiry,
  deriveFirstName,
  isValidationError,
  isValidToken,
  mapGrantDuration,
  maskEmail,
  validateSubmission,
} from '../../supabase/functions/outreach-form/logic';

describe('mapGrantDuration', () => {
  it('maps 3 months to three_month', () => {
    expect(mapGrantDuration(3)).toBe('three_month');
  });
  it('maps 2 months to two_month', () => {
    expect(mapGrantDuration(2)).toBe('two_month');
  });
  it('throws on an unsupported month count', () => {
    expect(() => mapGrantDuration(1)).toThrow(/unsupported grant_months/);
    expect(() => mapGrantDuration(6)).toThrow(/unsupported grant_months/);
  });
});

describe('computeGrantExpiry', () => {
  it('adds N months in UTC', () => {
    const start = new Date('2026-07-20T12:00:00.000Z');
    expect(computeGrantExpiry(start, 3).toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(computeGrantExpiry(start, 2).toISOString()).toBe('2026-09-20T12:00:00.000Z');
  });
  it('rolls over year boundaries', () => {
    const start = new Date('2026-11-15T00:00:00.000Z');
    expect(computeGrantExpiry(start, 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });
  it('does not mutate the input date', () => {
    const start = new Date('2026-07-20T12:00:00.000Z');
    computeGrantExpiry(start, 3);
    expect(start.toISOString()).toBe('2026-07-20T12:00:00.000Z');
  });
});

describe('maskEmail', () => {
  it('keeps the first char and the domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j***@example.com');
    expect(maskEmail('sam.smith@mail.test')).toBe('s***@mail.test');
  });
  it('returns *** for a malformed email', () => {
    expect(maskEmail('notanemail')).toBe('***');
    expect(maskEmail('@nolocal.com')).toBe('***');
  });
});

describe('deriveFirstName', () => {
  it('extracts and capitalizes a first.last handle', () => {
    expect(deriveFirstName('jane.doe@example.com')).toBe('Jane');
    expect(deriveFirstName('SAM.smith99@example.com')).toBe('Sam');
  });
  it('returns undefined without a dot separator (avoids mangled logins)', () => {
    expect(deriveFirstName('janedoe@example.com')).toBeUndefined();
    expect(deriveFirstName('xy7z9q@example.com')).toBeUndefined();
  });
  it('returns undefined when the first segment is a single char', () => {
    expect(deriveFirstName('j.doe@example.com')).toBeUndefined();
  });
  it('returns undefined for malformed input', () => {
    expect(deriveFirstName('nope')).toBeUndefined();
  });
});

describe('isValidToken', () => {
  it('accepts a well-formed uuid', () => {
    expect(isValidToken('6ca242fa-b403-4868-af4a-e9a371fd71f5')).toBe(true);
  });
  it('rejects garbage, wrong length, and non-strings', () => {
    expect(isValidToken('not-a-uuid')).toBe(false);
    expect(isValidToken('6ca242fa-b403-4868-af4a')).toBe(false);
    expect(isValidToken(123)).toBe(false);
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });
});

describe('validateSubmission', () => {
  it('normalizes valid answers and defaults followup_ok to true', () => {
    const r = validateSubmission({
      answers: { discovery: 'tv_time', one_thing: '  keep my history  ' },
    });
    expect(isValidationError(r)).toBe(false);
    if (!isValidationError(r)) {
      expect(r.answers).toEqual({ discovery: 'tv_time', one_thing: 'keep my history' });
      expect(r.followupOk).toBe(true);
    }
  });

  it('coerces followup_ok strictly to boolean', () => {
    const yes = validateSubmission({ answers: {}, followup_ok: true });
    const no = validateSubmission({ answers: {}, followup_ok: false });
    const truthy = validateSubmission({ answers: {}, followup_ok: 'yes' });
    expect((yes as any).followupOk).toBe(true);
    expect((no as any).followupOk).toBe(false);
    expect((truthy as any).followupOk).toBe(false); // only strict true counts
  });

  it('rejects a non-object body', () => {
    expect(isValidationError(validateSubmission(null))).toBe(true);
    expect(isValidationError(validateSubmission('x'))).toBe(true);
  });

  it('rejects answers that are not a plain object', () => {
    expect(isValidationError(validateSubmission({ answers: null }))).toBe(true);
    expect(isValidationError(validateSubmission({ answers: [1, 2] }))).toBe(true);
    expect(isValidationError(validateSubmission({ answers: 'nope' }))).toBe(true);
  });

  it('truncates over-long string values', () => {
    const long = 'a'.repeat(5000);
    const r = validateSubmission({ answers: { note: long } });
    if (!isValidationError(r)) {
      expect((r.answers.note as string).length).toBe(2000);
    }
  });

  it('drops nested objects/arrays but keeps scalars', () => {
    const r = validateSubmission({
      answers: { keep: 'yes', num: 3, bool: true, nil: null, nested: { a: 1 }, arr: [1] },
    });
    if (!isValidationError(r)) {
      expect(r.answers).toEqual({ keep: 'yes', num: 3, bool: true, nil: null });
    }
  });

  it('rejects an oversized answers payload', () => {
    const answers: Record<string, string> = {};
    for (let i = 0; i < 10; i++) answers[`k${i}`] = 'a'.repeat(1900);
    expect(isValidationError(validateSubmission({ answers }))).toBe(true);
  });
});
