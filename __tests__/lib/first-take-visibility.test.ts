import {
  hasTakeWords,
  isPubliclyVisibleTake,
  filterPubliclyVisibleTakes,
  filterPubliclyVisibleBy,
} from '@/lib/first-take-visibility';

describe('hasTakeWords', () => {
  it('accepts ordinary text', () => {
    expect(hasTakeWords('Best hour of television this year')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(hasTakeWords('')).toBe(false);
  });

  it('rejects whitespace-only text — the case the SQL `.like` guard misses', () => {
    // `.like('quote_text', '_%')` matches these: `_` is any single character,
    // spaces included. They only die here.
    expect(hasTakeWords(' ')).toBe(false);
    expect(hasTakeWords('   ')).toBe(false);
    expect(hasTakeWords('\n')).toBe(false);
    expect(hasTakeWords('\t \n ')).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(hasTakeWords(null)).toBe(false);
    expect(hasTakeWords(undefined)).toBe(false);
  });

  it('accepts an emoji-only take — any non-whitespace character is words', () => {
    // Deliberate: the rule is "nothing in it", not "not enough effort".
    expect(hasTakeWords('🔥')).toBe(true);
    expect(hasTakeWords('  🔥  ')).toBe(true);
  });

  it('accepts punctuation-only text for the same reason', () => {
    expect(hasTakeWords('...')).toBe(true);
  });
});

describe('isPubliclyVisibleTake', () => {
  it('is true for a take with words', () => {
    expect(isPubliclyVisibleTake({ quote_text: 'Devastating.' })).toBe(true);
  });

  it('is false for a rating-only take', () => {
    expect(isPubliclyVisibleTake({ quote_text: '' })).toBe(false);
    expect(isPubliclyVisibleTake({ quote_text: '  ' })).toBe(false);
    expect(isPubliclyVisibleTake({ quote_text: null })).toBe(false);
    expect(isPubliclyVisibleTake({})).toBe(false);
  });

  it('is false for a missing take', () => {
    expect(isPubliclyVisibleTake(null)).toBe(false);
    expect(isPubliclyVisibleTake(undefined)).toBe(false);
  });
});

describe('filterPubliclyVisibleTakes', () => {
  it('keeps worded takes and drops wordless ones, preserving order', () => {
    const takes = [
      { id: 'a', quote_text: 'First' },
      { id: 'b', quote_text: '' },
      { id: 'c', quote_text: '   ' },
      { id: 'd', quote_text: 'Last' },
    ];

    expect(filterPubliclyVisibleTakes(takes).map((t) => t.id)).toEqual(['a', 'd']);
  });

  it('returns an empty list when every take is wordless', () => {
    expect(filterPubliclyVisibleTakes([{ quote_text: '' }, { quote_text: null }])).toEqual([]);
  });
});

describe('filterPubliclyVisibleBy', () => {
  it('applies the same rule through an accessor for renamed fields', () => {
    const items = [
      { id: 'a', quoteText: 'Worth it' },
      { id: 'b', quoteText: '' },
      { id: 'c', quoteText: '\n' },
    ];

    expect(
      filterPubliclyVisibleBy(items, (i) => i.quoteText).map((i) => i.id)
    ).toEqual(['a']);
  });
});
