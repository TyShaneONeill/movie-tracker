import {
  canEditPost,
  canEditComment,
  isEditWindowClosedError,
  EDIT_GRACE_MS,
  EDIT_WINDOW_CLOSED_MESSAGE,
} from '@/lib/edit-window';

// Fixed reference clock so window math is deterministic.
const NOW = Date.UTC(2026, 6, 5, 12, 0, 0); // 2026-07-05T12:00:00Z
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('EDIT_GRACE_MS', () => {
  it('is 15 minutes, matching the DB trigger', () => {
    expect(EDIT_GRACE_MS).toBe(15 * 60 * 1000);
  });
});

describe('canEditPost', () => {
  it('is editable within the window with zero engagement', () => {
    const post = { created_at: iso(60 * 1000), like_count: 0, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(true);
  });

  it('is editable exactly at the window boundary', () => {
    const post = { created_at: iso(EDIT_GRACE_MS), like_count: 0, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(true);
  });

  it('is NOT editable when it has a like (even fresh)', () => {
    const post = { created_at: iso(60 * 1000), like_count: 1, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(false);
  });

  it('is NOT editable when it has a comment (even fresh)', () => {
    const post = { created_at: iso(60 * 1000), like_count: 0, comment_count: 1 };
    expect(canEditPost(post, NOW)).toBe(false);
  });

  it('is NOT editable once past the 15 min window', () => {
    const post = { created_at: iso(EDIT_GRACE_MS + 1000), like_count: 0, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(false);
  });

  it('is NOT editable when created_at is null', () => {
    const post = { created_at: null, like_count: 0, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(false);
  });

  it('is NOT editable when created_at is an invalid date string', () => {
    const post = { created_at: 'not-a-date', like_count: 0, comment_count: 0 };
    expect(canEditPost(post, NOW)).toBe(false);
  });

  it('treats null/undefined counts as zero engagement', () => {
    const post = { created_at: iso(60 * 1000), like_count: null, comment_count: null };
    expect(canEditPost(post, NOW)).toBe(true);
  });
});

describe('canEditComment', () => {
  it('is editable within the window with zero likes', () => {
    const comment = { created_at: iso(60 * 1000), like_count: 0 };
    expect(canEditComment(comment, NOW)).toBe(true);
  });

  it('is NOT editable when liked', () => {
    const comment = { created_at: iso(60 * 1000), like_count: 3 };
    expect(canEditComment(comment, NOW)).toBe(false);
  });

  it('is NOT editable once past the 15 min window', () => {
    const comment = { created_at: iso(EDIT_GRACE_MS + 1), like_count: 0 };
    expect(canEditComment(comment, NOW)).toBe(false);
  });

  it('is NOT editable when created_at is null', () => {
    const comment = { created_at: null, like_count: 0 };
    expect(canEditComment(comment, NOW)).toBe(false);
  });

  it('is NOT editable when created_at is invalid', () => {
    const comment = { created_at: 'garbage', like_count: 0 };
    expect(canEditComment(comment, NOW)).toBe(false);
  });
});

describe('isEditWindowClosedError', () => {
  it('matches an Error carrying the trigger marker', () => {
    expect(isEditWindowClosedError(new Error('edit_window_closed'))).toBe(true);
  });

  it('matches a Postgres-style error object with the marker in the message', () => {
    const pgError = {
      message: 'edit_window_closed',
      code: 'P0001',
      details: null,
      hint: 'edit_window_closed',
    };
    expect(isEditWindowClosedError(pgError)).toBe(true);
  });

  it('matches a plain string carrying the marker', () => {
    expect(isEditWindowClosedError('boom: edit_window_closed')).toBe(true);
  });

  it('does NOT match an unrelated error', () => {
    expect(isEditWindowClosedError(new Error('network request failed'))).toBe(false);
  });

  it('does NOT match null/undefined', () => {
    expect(isEditWindowClosedError(null)).toBe(false);
    expect(isEditWindowClosedError(undefined)).toBe(false);
  });

  it('exposes a friendly user-facing message', () => {
    expect(EDIT_WINDOW_CLOSED_MESSAGE).toMatch(/Delete and repost/i);
  });
});
