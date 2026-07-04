import {
  computeRatingPersonality,
  histogram,
  normalizeCommunityPayload,
  DIVERGENCE_TOP_N,
  type CommunityPayload,
  type UserRating,
} from '@/lib/rating-personality';

function ratings(values: number[]): UserRating[] {
  return values.map((rating, i) => ({
    rating,
    tmdbId: 1000 + i,
    title: `Movie ${i}`,
    posterPath: `/p${i}.jpg`,
    year: 2000 + i,
  }));
}

const emptyCommunity: CommunityPayload = {
  community_avg: null,
  community_dist: new Array(10).fill(0),
  per_title: [],
};

function community(avg: number | null, perTitle: CommunityPayload['per_title'] = []): CommunityPayload {
  return { community_avg: avg, community_dist: new Array(10).fill(0), per_title: perTitle };
}

describe('histogram', () => {
  it('buckets ratings into a length-10 array (index 0 = score 1)', () => {
    expect(histogram([1, 1, 5, 10])).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('rounds fractional ratings to the nearest bucket', () => {
    // 7.4 → 7 (index 6), 7.5 → 8 (index 7), 2.6 → 3 (index 2)
    expect(histogram([7.4, 7.5, 2.6])).toEqual([0, 0, 1, 0, 0, 0, 1, 1, 0, 0]);
  });

  it('clamps out-of-range values into 1..10', () => {
    // 0 and negative clamp to score 1 (index 0); 11+ clamp to score 10 (index 9)
    expect(histogram([0, -3, 11, 99])).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  });
});

describe('computeRatingPersonality — core math', () => {
  it('computes yourAvg, delta, rated and pctHigh', () => {
    // avg of [8,9,10,4,5] = 36/5 = 7.2; >=8 → 3 of 5 = 60%
    const rp = computeRatingPersonality(ratings([8, 9, 10, 4, 5]), community(6.5));
    expect(rp.rated).toBe(5);
    expect(rp.yourAvg).toBe(7.2);
    expect(rp.communityAvg).toBe(6.5);
    expect(rp.delta).toBe(0.7);
    expect(rp.pctHigh).toBe(60);
  });

  it('rounds pctHigh to the nearest integer', () => {
    // 2 of 3 >= 8 → 66.67 → 67
    const rp = computeRatingPersonality(ratings([8, 9, 2]), community(7));
    expect(rp.pctHigh).toBe(67);
  });

  it('handles an empty community average as 0', () => {
    const rp = computeRatingPersonality(ratings([5, 5]), emptyCommunity);
    expect(rp.communityAvg).toBe(0);
    expect(rp.yourAvg).toBe(5);
    expect(rp.delta).toBe(5);
  });

  it('sets marker positions to avg/10, clamped to [0,1]', () => {
    const rp = computeRatingPersonality(ratings([10, 10]), community(4));
    expect(rp.position).toBe(1); // 10/10
    expect(rp.communityMarker).toBe(0.4);
  });
});

describe('computeRatingPersonality — verdict thresholds', () => {
  it('is Generous when the user is >= 0.5 above the crowd', () => {
    const rp = computeRatingPersonality(ratings([8, 8]), community(7.4)); // delta +0.6
    expect(rp.verdict).toBe('Generous');
    expect(rp.blurb).toContain('higher');
  });

  it('is Tough when the user is <= 0.5 below the crowd', () => {
    const rp = computeRatingPersonality(ratings([6, 6]), community(6.7)); // delta -0.7
    expect(rp.verdict).toBe('Tough');
    expect(rp.blurb).toContain('lower');
  });

  it('is Balanced inside the +/-0.5 band', () => {
    const rp = computeRatingPersonality(ratings([7, 7]), community(6.7)); // delta +0.3
    expect(rp.verdict).toBe('Balanced');
    expect(rp.blurb).toContain('track');
  });

  it('treats exactly +0.5 as Generous (inclusive band edge)', () => {
    const rp = computeRatingPersonality(ratings([7, 7]), community(6.5)); // delta +0.5
    expect(rp.verdict).toBe('Generous');
  });
});

describe('computeRatingPersonality — distribution', () => {
  it('builds the user histogram and passes community through', () => {
    const dist = [0, 0, 0, 0, 0, 0, 0, 5, 3, 1];
    const rp = computeRatingPersonality(ratings([8, 8, 10]), {
      community_avg: 7,
      community_dist: dist,
      per_title: [],
    });
    expect(rp.dist.you).toEqual([0, 0, 0, 0, 0, 0, 0, 2, 0, 1]);
    expect(rp.dist.community).toEqual(dist);
  });
});

describe('computeRatingPersonality — divergence', () => {
  const userRatings: UserRating[] = [
    { rating: 9, tmdbId: 1, title: 'Overrated by me', posterPath: '/a.jpg', year: 2001 },
    { rating: 3, tmdbId: 2, title: 'Underrated by me', posterPath: '/b.jpg', year: 2002 },
    { rating: 6, tmdbId: 3, title: 'Small gap', posterPath: '/c.jpg', year: 2003 },
    { rating: 7, tmdbId: 4, title: 'Dead on', posterPath: '/d.jpg', year: 2004 },
    { rating: 8, tmdbId: 5, title: 'No consensus', posterPath: '/e.jpg', year: 2005 },
  ];
  const per = [
    { tmdb_id: 1, community_avg: 6.0, rater_count: 4 }, // you +3.0 → generous
    { tmdb_id: 2, community_avg: 7.5, rater_count: 3 }, // you -4.5 → tougher
    { tmdb_id: 3, community_avg: 6.5, rater_count: 2 }, // you -0.5 → tougher
    { tmdb_id: 4, community_avg: 7.0, rater_count: 5 }, // you 0.0 → neither
    // tmdb_id 5 intentionally absent from per_title (< 2 raters)
  ];

  it('splits titles into generous (you higher) and tougher (you lower)', () => {
    const rp = computeRatingPersonality(userRatings, community(6.8, per));
    expect(rp.generous.map((r) => r.title)).toEqual(['Overrated by me']);
    expect(rp.tougher.map((r) => r.title)).toEqual(['Underrated by me', 'Small gap']);
  });

  it('sorts each list by absolute gap descending', () => {
    const rp = computeRatingPersonality(userRatings, community(6.8, per));
    // tougher: -4.5 gap before -0.5 gap
    expect(rp.tougher[0].title).toBe('Underrated by me');
    expect(rp.tougher[1].title).toBe('Small gap');
  });

  it('excludes exact ties and titles without >=2-rater consensus', () => {
    const rp = computeRatingPersonality(userRatings, community(6.8, per));
    const allTitles = [...rp.generous, ...rp.tougher].map((r) => r.title);
    expect(allTitles).not.toContain('Dead on'); // tie
    expect(allTitles).not.toContain('No consensus'); // no per_title entry
  });

  it('caps each list at DIVERGENCE_TOP_N', () => {
    const many: UserRating[] = Array.from({ length: 12 }, (_, i) => ({
      rating: 10,
      tmdbId: 100 + i,
      title: `Gen ${i}`,
      posterPath: null,
      year: null,
    }));
    const manyPer = many.map((r, i) => ({
      tmdb_id: r.tmdbId,
      community_avg: 5 - i * 0.1, // all lower than 10 → all generous, varied gaps
      rater_count: 3,
    }));
    const rp = computeRatingPersonality(many, community(5, manyPer));
    expect(rp.generous.length).toBe(DIVERGENCE_TOP_N);
    expect(rp.tougher.length).toBe(0);
  });

  it('carries year + poster through onto the rows', () => {
    const rp = computeRatingPersonality(userRatings, community(6.8, per));
    const row = rp.generous[0];
    expect(row.year).toBe(2001);
    expect(row.poster).toBe('/a.jpg');
    expect(row.you).toBe(9);
    expect(row.crowd).toBe(6);
  });

  it('sets hasDivergenceData=true when at least one diverging title exists', () => {
    const rp = computeRatingPersonality(userRatings, community(6.8, per));
    expect(rp.hasDivergenceData).toBe(true);
  });

  it('sets hasDivergenceData=false when there is no qualifying overlap', () => {
    const rp = computeRatingPersonality(ratings([8, 9, 7, 6, 5]), community(6.8, []));
    expect(rp.hasDivergenceData).toBe(false);
    expect(rp.generous).toEqual([]);
    expect(rp.tougher).toEqual([]);
  });

  it('sets hasDivergenceData=false when the only overlap is an exact tie', () => {
    const rp = computeRatingPersonality(
      [{ rating: 7, tmdbId: 4, title: 'Dead on', posterPath: null, year: null }],
      community(7, [{ tmdb_id: 4, community_avg: 7.0, rater_count: 9 }])
    );
    expect(rp.hasDivergenceData).toBe(false);
  });

  it('de-dupes repeated tmdb_ids (rewatch takes), keeping the first', () => {
    const dupes: UserRating[] = [
      { rating: 9, tmdbId: 1, title: 'First take', posterPath: null, year: null },
      { rating: 2, tmdbId: 1, title: 'Older take', posterPath: null, year: null },
    ];
    const rp = computeRatingPersonality(dupes, community(6, [
      { tmdb_id: 1, community_avg: 6.0, rater_count: 4 },
    ]));
    expect(rp.generous.length).toBe(1);
    expect(rp.generous[0].you).toBe(9); // first occurrence wins
  });
});

describe('normalizeCommunityPayload', () => {
  it('returns safe defaults for null / garbage input', () => {
    expect(normalizeCommunityPayload(null)).toEqual({
      community_avg: null,
      community_dist: new Array(10).fill(0),
      per_title: [],
    });
  });

  it('pads a short dist array to length 10', () => {
    const out = normalizeCommunityPayload({ community_avg: 7, community_dist: [1, 2, 3] });
    expect(out.community_dist).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0, 0]);
    expect(out.community_avg).toBe(7);
  });

  it('drops malformed per_title entries', () => {
    const out = normalizeCommunityPayload({
      community_avg: 6,
      community_dist: new Array(10).fill(0),
      per_title: [
        { tmdb_id: 1, community_avg: 7, rater_count: 3 },
        { tmdb_id: 'bad', community_avg: 7, rater_count: 3 },
        { community_avg: 7 },
      ],
    });
    expect(out.per_title).toEqual([{ tmdb_id: 1, community_avg: 7, rater_count: 3 }]);
  });
});
