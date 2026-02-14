jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('@/lib/supabase', () => ({}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/image-utils', () => ({ getFileExtension: jest.fn() }));

import { buildAvatarUrl } from '@/lib/avatar-service';

describe('buildAvatarUrl', () => {
  // ---------------------------------------------------------------------------
  // Returns null for falsy inputs
  // ---------------------------------------------------------------------------
  it.each([
    { input: null, label: 'null' },
    { input: undefined, label: 'undefined' },
    { input: '', label: 'empty string' },
  ])('returns null when avatarUrl is $label', ({ input }) => {
    expect(buildAvatarUrl(input)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Strips legacy query params (no updatedAt)
  // ---------------------------------------------------------------------------
  it.each([
    {
      url: 'https://example.com/avatar.jpg?t=1234567890',
      expected: 'https://example.com/avatar.jpg',
      label: 'single param',
    },
    {
      url: 'https://example.com/avatar.jpg?t=1234567890&other=foo',
      expected: 'https://example.com/avatar.jpg',
      label: 'multiple params',
    },
  ])('strips legacy query params ($label)', ({ url, expected }) => {
    expect(buildAvatarUrl(url, undefined)).toBe(expected);
  });

  // ---------------------------------------------------------------------------
  // Clean URL without updatedAt returns URL as-is
  // ---------------------------------------------------------------------------
  it.each([null, undefined])(
    'returns clean URL when updatedAt is %s',
    (updatedAt) => {
      expect(buildAvatarUrl('https://example.com/avatar.jpg', updatedAt)).toBe(
        'https://example.com/avatar.jpg'
      );
    }
  );

  // ---------------------------------------------------------------------------
  // Appends content-based cache key
  // ---------------------------------------------------------------------------
  it('appends encoded updatedAt as cache key', () => {
    expect(
      buildAvatarUrl(
        'https://example.com/avatar.jpg',
        '2025-01-15T10:30:00.000Z'
      )
    ).toBe('https://example.com/avatar.jpg?v=2025-01-15T10%3A30%3A00.000Z');
  });

  // ---------------------------------------------------------------------------
  // Strips legacy params AND appends new cache key
  // ---------------------------------------------------------------------------
  it('strips legacy params and appends new cache key', () => {
    expect(
      buildAvatarUrl(
        'https://example.com/avatar.jpg?t=old',
        '2025-01-15T10:30:00.000Z'
      )
    ).toBe('https://example.com/avatar.jpg?v=2025-01-15T10%3A30%3A00.000Z');
  });
});
