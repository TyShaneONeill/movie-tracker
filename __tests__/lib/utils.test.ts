import { formatRelativeTime } from '@/lib/utils';

/** Helper: return an ISO string for `n` units ago from now */
function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe('formatRelativeTime', () => {
  describe('returns "Just now"', () => {
    it('for 0 seconds ago', () => {
      expect(formatRelativeTime(ago(0))).toBe('Just now');
    });

    it('for 59 seconds ago', () => {
      expect(formatRelativeTime(ago(59))).toBe('Just now');
    });
  });

  describe('returns minutes', () => {
    it('for exactly 1 minute ago', () => {
      expect(formatRelativeTime(ago(60))).toBe('1m ago');
    });

    it('for 30 minutes ago', () => {
      expect(formatRelativeTime(ago(30 * 60))).toBe('30m ago');
    });

    it('for 59 minutes ago', () => {
      expect(formatRelativeTime(ago(59 * 60))).toBe('59m ago');
    });
  });

  describe('returns hours', () => {
    it('for exactly 1 hour ago', () => {
      expect(formatRelativeTime(ago(60 * 60))).toBe('1h ago');
    });

    it('for 12 hours ago', () => {
      expect(formatRelativeTime(ago(12 * 60 * 60))).toBe('12h ago');
    });

    it('for 23 hours ago', () => {
      expect(formatRelativeTime(ago(23 * 60 * 60))).toBe('23h ago');
    });
  });

  describe('returns days', () => {
    it('for exactly 1 day ago', () => {
      expect(formatRelativeTime(ago(24 * 60 * 60))).toBe('1d ago');
    });

    it('for 6 days ago', () => {
      expect(formatRelativeTime(ago(6 * 24 * 60 * 60))).toBe('6d ago');
    });
  });

  describe('returns formatted date for >= 7 days', () => {
    it('for 7 days ago (same year) omits the year', () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(sevenDaysAgo.toISOString());

      const expected = sevenDaysAgo.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      expect(result).toBe(expected);
    });

    it('for a date in a different year includes the year', () => {
      const pastYear = new Date();
      pastYear.setFullYear(pastYear.getFullYear() - 1);
      const result = formatRelativeTime(pastYear.toISOString());

      const expected = pastYear.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      expect(result).toBe(expected);
    });
  });
});
