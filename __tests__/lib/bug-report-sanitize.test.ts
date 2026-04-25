import {
  sanitizeTitle,
  sanitizeDescription,
  scrubPII,
} from '../../supabase/functions/_shared/bug-report-sanitize';

describe('sanitizeTitle', () => {
  it('flattens newlines to spaces', () => {
    expect(sanitizeTitle('line1\nline2')).toBe('line1 line2');
    expect(sanitizeTitle('line1\r\nline2')).toBe('line1 line2');
  });

  it('strips null bytes and non-printing control chars', () => {
    expect(sanitizeTitle('ab\x00cd')).toBe('abcd');
    expect(sanitizeTitle('ab\x07cd')).toBe('abcd');
  });

  it('preserves legit whitespace and unicode', () => {
    expect(sanitizeTitle('App crashed  on tap')).toBe('App crashed  on tap');
    expect(sanitizeTitle('Bug in 映画 tab')).toBe('Bug in 映画 tab');
  });

  it('preserves tab in a title by flattening to space', () => {
    expect(sanitizeTitle('a\tb')).toBe('a b');
  });
});

describe('sanitizeDescription', () => {
  it('preserves newlines (user formatting)', () => {
    expect(sanitizeDescription('line1\nline2')).toBe('line1\nline2');
  });

  it('strips null bytes and non-printing control chars except \\n \\r \\t', () => {
    expect(sanitizeDescription('ab\x00cd')).toBe('abcd');
    expect(sanitizeDescription('ab\x07cd')).toBe('abcd');
    expect(sanitizeDescription('ab\ncd')).toBe('ab\ncd');
    expect(sanitizeDescription('ab\tcd')).toBe('ab\tcd');
  });

  it('preserves unicode', () => {
    expect(sanitizeDescription('Bug in 映画 tab')).toBe('Bug in 映画 tab');
  });
});

describe('scrubPII', () => {
  it('redacts email addresses', () => {
    expect(scrubPII('contact me at foo@example.com for more')).toBe(
      'contact me at [REDACTED_EMAIL] for more'
    );
  });

  it('redacts multiple emails', () => {
    expect(scrubPII('a@b.co and c@d.co')).toBe('[REDACTED_EMAIL] and [REDACTED_EMAIL]');
  });

  it('redacts CC-like digit runs', () => {
    expect(scrubPII('card 4111111111111111 declined')).toBe(
      'card [REDACTED_CC] declined'
    );
  });

  it('does NOT redact short digit runs', () => {
    expect(scrubPII('PR #399 and 2026-04-24')).toBe('PR #399 and 2026-04-24');
  });

  it('redacts password: pattern', () => {
    expect(scrubPII('password: hunter2 works')).toBe(
      'password: [REDACTED_PW] works'
    );
    expect(scrubPII('password=hunter2 works')).toBe(
      'password: [REDACTED_PW] works'
    );
    expect(scrubPII('PASSWORD : hunter2')).toBe('password: [REDACTED_PW]');
  });

  it('applies multiple redactions in the same string', () => {
    expect(scrubPII('email foo@bar.co card 4111111111111111')).toBe(
      'email [REDACTED_EMAIL] card [REDACTED_CC]'
    );
  });

  it('is a no-op on clean strings', () => {
    expect(scrubPII('app crashed when I tapped scan')).toBe(
      'app crashed when I tapped scan'
    );
  });
});
