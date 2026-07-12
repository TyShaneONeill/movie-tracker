import {
  buildFeedV2Items,
  dayBucket,
  formatShortTime,
  artifactVerb,
  type TopComment,
  type FeedV2Item,
} from '@/lib/feed-v2-logic';
import type { ActivityFeedItem } from '@/hooks/use-activity-feed';

// Local-time constructor so day bucketing is TZ-stable within a test run: both
// `now` and the item timestamps round-trip through the same local calendar day.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
const NOW = new Date(2026, 6, 12, 12, 0, 0); // Sun Jul 12 2026, noon local

function makeArtifact(over: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return {
    id: 'a1',
    userId: 'u1',
    tmdbId: 1,
    movieTitle: 'Dune: Part Two',
    posterPath: null,
    rating: 8,
    quoteText: 'A religious experience.',
    isSpoiler: false,
    visibility: 'public',
    createdAt: at(2026, 6, 12, 10),
    mediaType: 'movie',
    userDisplayName: 'jess',
    userAvatarUrl: null,
    activityType: 'first_take',
    ...over,
  };
}

function makeTopComment(over: Partial<TopComment> = {}): TopComment {
  return {
    id: 'c1',
    artifactId: 'a1',
    artifactType: 'first_take',
    userId: 'u9',
    body: 'the popcorn line is real',
    isSpoiler: false,
    createdAt: at(2026, 6, 12, 11),
    likeCount: 5,
    commenterName: 'marcus',
    commenterAvatarUrl: null,
    ...over,
  };
}

const kinds = (items: FeedV2Item[]) => items.map((i) => i.kind);
const indexOfKind = (items: FeedV2Item[], kind: string) => items.findIndex((i) => i.kind === kind);

describe('dayBucket', () => {
  it('labels today / yesterday / this week / absolute date', () => {
    expect(dayBucket(at(2026, 6, 12, 9), NOW).label).toBe('Today');
    expect(dayBucket(at(2026, 6, 11, 9), NOW).label).toBe('Yesterday');
    expect(dayBucket(at(2026, 6, 9, 9), NOW).label).toBe('This Week');
    expect(dayBucket(at(2026, 6, 1, 9), NOW).label).toBe('Jul 1');
    expect(dayBucket(at(2025, 11, 25, 9), NOW).label).toBe('Dec 25, 2025');
  });

  it('gives stable, distinct keys per bucket', () => {
    expect(dayBucket(at(2026, 6, 12, 9), NOW).key).toBe('day-today');
    expect(dayBucket(at(2026, 6, 11, 9), NOW).key).toBe('day-yesterday');
    expect(dayBucket(null, NOW).key).toBe('day-undated');
  });
});

describe('formatShortTime', () => {
  it('formats terse relative time', () => {
    expect(formatShortTime(new Date(NOW.getTime() - 30 * 1000).toISOString(), NOW)).toBe('now');
    expect(formatShortTime(new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(), NOW)).toBe('5m');
    expect(formatShortTime(new Date(NOW.getTime() - 2 * 3600 * 1000).toISOString(), NOW)).toBe('2h');
    expect(formatShortTime(new Date(NOW.getTime() - 3 * 86400 * 1000).toISOString(), NOW)).toBe('3d');
    expect(formatShortTime(new Date(NOW.getTime() - 14 * 86400 * 1000).toISOString(), NOW)).toBe('2w');
    expect(formatShortTime(null, NOW)).toBe('');
  });
});

describe('artifactVerb', () => {
  it('picks the verb by activity type', () => {
    expect(artifactVerb(makeArtifact({ activityType: 'first_take' }))).toBe('logged a first take');
    expect(artifactVerb(makeArtifact({ activityType: 'review' }))).toBe('wrote a review');
  });
});

describe('buildFeedV2Items — day grouping', () => {
  it('emits a day header per bucket and perforations between same-day groups', () => {
    const items = buildFeedV2Items({
      followingItems: [
        makeArtifact({ id: 'a1', createdAt: at(2026, 6, 12, 11) }),
        makeArtifact({ id: 'a2', createdAt: at(2026, 6, 12, 9) }),
        makeArtifact({ id: 'a3', createdAt: at(2026, 6, 11, 9) }),
      ],
      communityItems: [],
      topComments: new Map(),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });

    // Today header, a1, perf, a2, Yesterday header, a3 (no perf: first in its day)
    expect(kinds(items)).toEqual(['day', 'artifact', 'perf', 'artifact', 'day', 'artifact']);
    const days = items.filter((i) => i.kind === 'day') as Extract<FeedV2Item, { kind: 'day' }>[];
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday']);
  });
});

describe('buildFeedV2Items — rail placement (Decision 5)', () => {
  it('promotes the rail to the top when the feed is thin (<3 threads)', () => {
    const items = buildFeedV2Items({
      followingItems: [makeArtifact({ id: 'a1' }), makeArtifact({ id: 'a2' })],
      communityItems: [],
      topComments: new Map(),
      railEnabled: true,
      filter: 'all',
      now: NOW,
    });
    expect(items[0].kind).toBe('rail');
    expect(items.filter((i) => i.kind === 'rail')).toHaveLength(1);
  });

  it('interleaves the rail after the 2nd artifact group when healthy (≥3 threads)', () => {
    const items = buildFeedV2Items({
      followingItems: [
        makeArtifact({ id: 'a1', createdAt: at(2026, 6, 12, 11) }),
        makeArtifact({ id: 'a2', createdAt: at(2026, 6, 12, 10) }),
        makeArtifact({ id: 'a3', createdAt: at(2026, 6, 12, 9) }),
      ],
      communityItems: [],
      topComments: new Map(),
      railEnabled: true,
      filter: 'all',
      now: NOW,
    });

    const railIdx = indexOfKind(items, 'rail');
    expect(railIdx).toBeGreaterThan(-1);
    // Exactly two artifacts precede the rail.
    const artifactsBeforeRail = items.slice(0, railIdx).filter((i) => i.kind === 'artifact');
    expect(artifactsBeforeRail).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'rail')).toHaveLength(1);
  });

  it('yields a lone rail (no day header) when there is no content but suggestions exist', () => {
    // This is what the screen turns into "lobby is quiet" invitation + rail.
    const items = buildFeedV2Items({
      followingItems: [], communityItems: [], topComments: new Map(),
      railEnabled: true, filter: 'reviews', now: NOW,
    });
    expect(items).toEqual([{ kind: 'rail', key: 'rail' }]);
  });

  it('omits the rail entirely when no suggestions exist', () => {
    const items = buildFeedV2Items({
      followingItems: [makeArtifact({ id: 'a1' })],
      communityItems: [],
      topComments: new Map(),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });
    expect(items.some((i) => i.kind === 'rail')).toBe(false);
  });
});

describe('buildFeedV2Items — ad interleaving (parity with legacy feed)', () => {
  // N first takes, all today, strictly descending so order is stable.
  const makeN = (n: number) =>
    Array.from({ length: n }, (_, i) => makeArtifact({ id: `a${i}`, createdAt: at(2026, 6, 12, 11 - i) }));

  const adCount = (items: FeedV2Item[]) => items.filter((i) => i.kind === 'ad').length;
  const artifactsBefore = (items: FeedV2Item[], idx: number) =>
    items.slice(0, idx).filter((i) => i.kind === 'artifact').length;

  it('injects no ads when adsEnabled is false', () => {
    const items = buildFeedV2Items({
      followingItems: makeN(8), communityItems: [], topComments: new Map(),
      railEnabled: false, adsEnabled: false, filter: 'all', now: NOW,
    });
    expect(adCount(items)).toBe(0);
  });

  it('places the first ad after the 3rd artifact GROUP', () => {
    const items = buildFeedV2Items({
      followingItems: makeN(4), communityItems: [], topComments: new Map(),
      railEnabled: false, adsEnabled: true, filter: 'all', now: NOW,
    });
    expect(adCount(items)).toBe(1);
    const adIdx = indexOfKind(items, 'ad');
    expect(artifactsBefore(items, adIdx)).toBe(3);
  });

  it('then repeats every 5th group (groups 3, 8, …)', () => {
    const items = buildFeedV2Items({
      followingItems: makeN(9), communityItems: [], topComments: new Map(),
      railEnabled: false, adsEnabled: true, filter: 'all', now: NOW,
    });
    // 9 groups → ads after group 3 and group 8.
    expect(adCount(items)).toBe(2);
    const firstAd = items.findIndex((i) => i.kind === 'ad');
    const secondAd = items.findIndex((i, n) => i.kind === 'ad' && n > firstAd);
    expect(artifactsBefore(items, firstAd)).toBe(3);
    expect(artifactsBefore(items, secondAd)).toBe(8);
  });

  it('counts artifact GROUPS, not raw rows — murmurs do not advance the ad cadence', () => {
    // 3 artifacts each carrying a top-comment murmur = 6 rows but only 3 groups,
    // so exactly one ad lands (after group 3), not sooner.
    const tc = new Map(makeN(3).map((a) => [a.id, makeTopComment({ artifactId: a.id, id: `c-${a.id}` })]));
    const items = buildFeedV2Items({
      followingItems: makeN(3), communityItems: [], topComments: tc,
      railEnabled: false, adsEnabled: true, filter: 'all', now: NOW,
    });
    expect(adCount(items)).toBe(1);
    expect(artifactsBefore(items, indexOfKind(items, 'ad'))).toBe(3);
  });
});

describe('buildFeedV2Items — top-comment attachment (Decision 4)', () => {
  it('attaches an artifact top comment as a murmur beneath it', () => {
    const items = buildFeedV2Items({
      followingItems: [makeArtifact({ id: 'a1', activityType: 'first_take' })],
      communityItems: [],
      topComments: new Map([['a1', makeTopComment({ artifactId: 'a1' })]]),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });

    expect(kinds(items)).toEqual(['day', 'artifact', 'murmur']);
    const murmur = items[2] as Extract<FeedV2Item, { kind: 'murmur' }>;
    expect(murmur.murmur.body).toBe('the popcorn line is real');
    expect(murmur.murmur.ownerName).toBe('jess');
    expect(murmur.murmur.ownerType).toBe('take');
    expect(murmur.murmur.targetType).toBe('first_take');
    expect(murmur.murmur.targetId).toBe('a1');
  });

  it('uses "review" owner noun for a review artifact', () => {
    const items = buildFeedV2Items({
      followingItems: [makeArtifact({ id: 'r1', activityType: 'review', reviewTitle: 'Forks' })],
      communityItems: [],
      topComments: new Map([['r1', makeTopComment({ artifactId: 'r1', artifactType: 'review' })]]),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });
    const murmur = items.find((i) => i.kind === 'murmur') as Extract<FeedV2Item, { kind: 'murmur' }>;
    expect(murmur.murmur.ownerType).toBe('review');
    expect(murmur.murmur.targetType).toBe('review');
  });
});

describe('buildFeedV2Items — filters', () => {
  const following = [
    makeArtifact({ id: 'ft', activityType: 'first_take', userId: 'friend' }),
    makeArtifact({ id: 'rv', activityType: 'review', reviewTitle: 'R', userId: 'friend' }),
  ];
  const community = [makeArtifact({ id: 'cft', activityType: 'first_take', userId: 'stranger' })];

  const artifactIds = (items: FeedV2Item[]) =>
    items.filter((i) => i.kind === 'artifact').map((i) => (i as Extract<FeedV2Item, { kind: 'artifact' }>).item.id);

  it('"all" unions following + community artifacts', () => {
    const items = buildFeedV2Items({ followingItems: following, communityItems: community, topComments: new Map(), railEnabled: false, filter: 'all', now: NOW });
    expect(artifactIds(items).sort()).toEqual(['cft', 'ft', 'rv']);
  });

  it('"friends" keeps only followed users\' artifacts (excludes community)', () => {
    const items = buildFeedV2Items({ followingItems: following, communityItems: community, topComments: new Map(), railEnabled: false, filter: 'friends', now: NOW });
    expect(artifactIds(items).sort()).toEqual(['ft', 'rv']);
  });

  it('"first_takes" narrows to first takes only', () => {
    const items = buildFeedV2Items({ followingItems: following, communityItems: community, topComments: new Map(), railEnabled: false, filter: 'first_takes', now: NOW });
    expect(artifactIds(items).sort()).toEqual(['cft', 'ft']);
  });

  it('"reviews" narrows to reviews only', () => {
    const items = buildFeedV2Items({ followingItems: following, communityItems: community, topComments: new Map(), railEnabled: false, filter: 'reviews', now: NOW });
    expect(artifactIds(items)).toEqual(['rv']);
  });
});

describe('buildFeedV2Items — standalone comments', () => {
  function makeComment(over: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
    return makeArtifact({
      id: 'comment-x1',
      activityType: 'comment',
      commentText: 'loved this',
      targetReviewId: 'r1',
      targetReviewAuthorName: 'owner',
      ...over,
    });
  }

  it('drops a standalone comment whose parent artifact is already in the feed (no double murmur)', () => {
    const items = buildFeedV2Items({
      followingItems: [
        makeArtifact({ id: 'r1', activityType: 'review', reviewTitle: 'R' }),
        makeComment({ targetReviewId: 'r1' }),
      ],
      communityItems: [],
      topComments: new Map(),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });
    // Only the artifact — the comment is redundant (artifact would carry its top comment).
    expect(kinds(items)).toEqual(['day', 'artifact']);
  });

  it('renders a standalone comment as its own murmur when its parent is absent', () => {
    const items = buildFeedV2Items({
      followingItems: [makeComment({ targetReviewId: 'absent' })],
      communityItems: [],
      topComments: new Map(),
      railEnabled: false,
      filter: 'all',
      now: NOW,
    });
    expect(kinds(items)).toEqual(['day', 'murmur']);
    const murmur = items[1] as Extract<FeedV2Item, { kind: 'murmur' }>;
    expect(murmur.murmur.body).toBe('loved this');
    expect(murmur.murmur.ownerName).toBe('owner');
  });

  it('hides standalone comments under the first_takes filter', () => {
    const items = buildFeedV2Items({
      followingItems: [makeComment({ targetReviewId: 'absent' })],
      communityItems: [],
      topComments: new Map(),
      railEnabled: false,
      filter: 'first_takes',
      now: NOW,
    });
    expect(items.some((i) => i.kind === 'murmur')).toBe(false);
  });
});
