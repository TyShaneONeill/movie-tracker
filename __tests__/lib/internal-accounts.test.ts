import { isInternalEmail, INTERNAL_EMAILS } from '@/lib/internal-accounts';

describe('isInternalEmail', () => {
  it('matches known internal/test accounts', () => {
    expect(isInternalEmail('tyoneill97@gmail.com')).toBe(true);
    expect(isInternalEmail('g@g.g')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isInternalEmail('  TyONeill97@Gmail.com ')).toBe(true);
  });

  it('does not match real users', () => {
    expect(isInternalEmail('someone@example.com')).toBe(false);
  });

  it('handles null/undefined/empty safely', () => {
    expect(isInternalEmail(undefined)).toBe(false);
    expect(isInternalEmail(null)).toBe(false);
    expect(isInternalEmail('')).toBe(false);
  });

  it('exports a non-empty internal list', () => {
    expect(INTERNAL_EMAILS.length).toBeGreaterThan(0);
  });
});
