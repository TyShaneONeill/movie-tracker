import {
  contentChanged,
  validateCommentBody,
  REVIEW_CONTENT_FIELDS,
  FIRST_TAKE_CONTENT_FIELDS,
  COMMENT_CONTENT_FIELDS,
  COMMENT_MAX_LENGTH,
} from '@/lib/edited-provenance';

describe('contentChanged', () => {
  it('returns false for a no-op save (all content fields identical)', () => {
    const current = { title: 'Great', review_text: 'Loved it', rating: 8, is_spoiler: false };
    const incoming = { title: 'Great', review_text: 'Loved it', rating: 8, is_spoiler: false };
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(false);
  });

  it('returns true when a content field differs', () => {
    const current = { title: 'Great', review_text: 'Loved it', rating: 8, is_spoiler: false };
    const incoming = { title: 'Great', review_text: 'Loved it a lot', rating: 8, is_spoiler: false };
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(true);
  });

  it('returns true when only the rating changes', () => {
    const current = { rating: 8 };
    const incoming = { rating: 9 };
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(true);
  });

  it('returns true when only the spoiler flag changes', () => {
    const current = { is_spoiler: false };
    const incoming = { is_spoiler: true };
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(true);
  });

  it('returns false for a visibility-only edit (no content field present in incoming)', () => {
    // A visibility-only patch never includes any content field, so the incoming
    // map passed in only ever holds content keys — here it is empty.
    const current = { title: 'Great', review_text: 'Loved it', rating: 8, is_spoiler: false };
    const incoming = {};
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(false);
  });

  it('ignores fields that are undefined in incoming', () => {
    const current = { title: 'Great', rating: 8 };
    const incoming = { title: undefined, rating: 8 };
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(false);
  });

  it('treats an already-trimmed identical value as unchanged', () => {
    // Caller normalizes (trims) before comparing; a whitespace-only edit that
    // trims back to the same stored value must NOT count as edited.
    const current = { review_text: 'Loved it' };
    const incoming = { review_text: 'Loved it' }; // '  Loved it  '.trim()
    expect(contentChanged(current, incoming, REVIEW_CONTENT_FIELDS)).toBe(false);
  });

  it('detects first-take content changes (quote/emoji)', () => {
    const current = { quote_text: 'Wow', reaction_emoji: '🎬', rating: 7, is_spoiler: false };
    const changedQuote = { ...current, quote_text: 'Amazing' };
    const changedEmoji = { ...current, reaction_emoji: '🔥' };
    expect(contentChanged(current, changedQuote, FIRST_TAKE_CONTENT_FIELDS)).toBe(true);
    expect(contentChanged(current, changedEmoji, FIRST_TAKE_CONTENT_FIELDS)).toBe(true);
  });

  it('detects a comment body change', () => {
    expect(contentChanged({ body: 'hi' }, { body: 'hello' }, COMMENT_CONTENT_FIELDS)).toBe(true);
    expect(contentChanged({ body: 'hi' }, { body: 'hi' }, COMMENT_CONTENT_FIELDS)).toBe(false);
  });

  it('returns false when current row is null/undefined', () => {
    expect(contentChanged(null, { title: 'x' }, REVIEW_CONTENT_FIELDS)).toBe(false);
    expect(contentChanged(undefined, { title: 'x' }, REVIEW_CONTENT_FIELDS)).toBe(false);
  });
});

describe('validateCommentBody', () => {
  it('rejects an empty string', () => {
    const result = validateCommentBody('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects whitespace-only', () => {
    expect(validateCommentBody('    ').valid).toBe(false);
  });

  it('rejects a body over the max length', () => {
    const tooLong = 'a'.repeat(COMMENT_MAX_LENGTH + 1);
    const result = validateCommentBody(tooLong);
    expect(result.valid).toBe(false);
  });

  it('accepts a body exactly at the max length', () => {
    const atMax = 'a'.repeat(COMMENT_MAX_LENGTH);
    expect(validateCommentBody(atMax).valid).toBe(true);
  });

  it('accepts a valid body and returns the trimmed text', () => {
    const result = validateCommentBody('  hello world  ');
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe('hello world');
  });

  it('rejects non-string input', () => {
    // Guard accepts `unknown`; a non-string resolves to '' → invalid.
    expect(validateCommentBody(null).valid).toBe(false);
    expect(validateCommentBody(42).valid).toBe(false);
  });
});
