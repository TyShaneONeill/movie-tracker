/**
 * Pure logic for the Feed v2 redesign (design contract 01).
 *
 * The feed shows friends' ARTIFACTS (first takes as stub-back minis, reviews as
 * programme notes) under one-line attribution ledgers, day-grouped, with comment
 * "murmur" ledger lines and a "Shared taste" suggestion rail. All composition —
 * day bucketing, thread grouping, top-comment attachment, rail placement, filter
 * behavior, relative time — lives here as side-effect-free functions so the
 * FlatList renderer stays thin and the behavior is unit-tested without RN.
 *
 * The single source of truth: every visual row (day eyebrow, artifact,
 * attached/standalone murmur, perforation, rail) is a TYPED ITEM in one flat
 * array. The FlatList stays the only vertical scroller — no nested Virtualized
 * Lists (contract note D / hard rule 4).
 */

import type { ActivityFeedItem } from '@/hooks/use-activity-feed';

/** The four filter chips (contract Decision 1). Adds "First Takes" vs the
 * legacy three (all / reviews / friends). Kept separate from the legacy
 * `FeedFilter` type so the legacy feed stays byte-identical. */
export type FeedV2Filter = 'all' | 'first_takes' | 'reviews' | 'friends';

export const FEED_V2_FILTERS: { value: FeedV2Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'first_takes', label: 'First Takes' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'friends', label: 'Friends' },
];

/**
 * The top comment attached beneath an artifact (contract Decision 4). Returned
 * by the feed service's batched read, keyed by artifact id.
 */
export interface TopComment {
  id: string;
  artifactId: string;
  artifactType: 'first_take' | 'review';
  userId: string;
  body: string;
  isSpoiler: boolean;
  createdAt: string;
  likeCount: number;
  commenterName: string;
  commenterAvatarUrl: string | null;
}

/** A comment rendered as a quiet ledger line (contract note C). Backs both the
 * standalone comment feed items and the attached top-comment murmurs. */
export interface FeedMurmur {
  id: string;
  commenterUserId: string;
  commenterName: string;
  commenterAvatarUrl: string | null;
  /** The artifact owner's display name — "…commented on {owner}'s take". */
  ownerName: string;
  /** "take" (first take) vs "review" — picks the possessive noun. */
  ownerType: 'take' | 'review';
  body: string;
  isSpoiler: boolean;
  createdAt: string | null;
  /** Navigation target = the parent artifact's detail route. */
  targetType: 'first_take' | 'review';
  targetId: string;
  tmdbId: number;
  mediaType: string;
}

/** Every row in the Feed v2 FlatList is one of these typed items. */
export type FeedV2Item =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'artifact'; key: string; item: ActivityFeedItem }
  | { kind: 'murmur'; key: string; murmur: FeedMurmur }
  | { kind: 'perf'; key: string }
  | { kind: 'rail'; key: string }
  | { kind: 'ad'; key: string };

// Feed ad cadence, mirroring the legacy feed (AD_FIRST_SLOT / AD_INTERVAL in
// feed-service) but counting artifact GROUPS, not raw list rows: the first ad
// lands after the 3rd artifact group, then one every 5th group thereafter.
// Defined locally to avoid a value import cycle with feed-service (which imports
// TopComment from here).
export const AD_FIRST_GROUP = 3;
export const AD_GROUP_INTERVAL = 5;

export interface BuildFeedV2Params {
  /** first_take | review | comment items from followed users (hook-merged). */
  followingItems: ActivityFeedItem[];
  /** first_take items from the community feed (strangers). */
  communityItems: ActivityFeedItem[];
  /** artifact id → its top comment (most-liked, fallback newest). */
  topComments: Map<string, TopComment>;
  /** Whether any suggestions exist — drives whether the rail item is inserted. */
  railEnabled: boolean;
  /** Whether feed ads should be interleaved (premium-off + not __DEV__). */
  adsEnabled?: boolean;
  filter: FeedV2Filter;
  /** Injected for deterministic day bucketing in tests. */
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Midnight-of-day timestamp in local time — for calendar-day differences. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * The day eyebrow bucket for a timestamp (contract note D): TODAY / YESTERDAY /
 * THIS WEEK / an absolute date. `key` is stable per bucket so the header's
 * FlatList key never collides.
 */
export function dayBucket(createdAt: string | null, now: Date): { key: string; label: string } {
  if (!createdAt) return { key: 'day-undated', label: 'Earlier' };
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return { key: 'day-undated', label: 'Earlier' };

  const diffDays = Math.round((dayStart(now) - dayStart(d)) / DAY_MS);
  if (diffDays <= 0) return { key: 'day-today', label: 'Today' };
  if (diffDays === 1) return { key: 'day-yesterday', label: 'Yesterday' };
  if (diffDays < 7) return { key: 'day-thisweek', label: 'This Week' };

  const sameYear = d.getFullYear() === now.getFullYear();
  const label = sameYear
    ? `${MONTHS[d.getMonth()]} ${d.getDate()}`
    : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return { key: `day-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, label };
}

/**
 * Compact relative time for the attribution ledger (contract: "2h", "1d", "3w").
 * Distinct from the app's "2h ago" formatter — the ledger wants the terse
 * tabular form.
 */
export function formatShortTime(createdAt: string | null, now: Date): string {
  if (!createdAt) return '';
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return '';
  const secs = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** first take vs review, for the "logged a first take" / "wrote a review" verb. */
export function artifactVerb(item: ActivityFeedItem): string {
  return item.activityType === 'review' ? 'wrote a review' : 'logged a first take';
}

function createdMs(item: { createdAt: string | null }): number {
  return item.createdAt ? new Date(item.createdAt).getTime() : 0;
}

function topCommentToMurmur(tc: TopComment, artifact: ActivityFeedItem): FeedMurmur {
  return {
    id: tc.id,
    commenterUserId: tc.userId,
    commenterName: tc.commenterName,
    commenterAvatarUrl: tc.commenterAvatarUrl,
    ownerName: artifact.userDisplayName ?? 'someone',
    ownerType: artifact.activityType === 'review' ? 'review' : 'take',
    body: tc.body,
    isSpoiler: tc.isSpoiler,
    createdAt: tc.createdAt,
    targetType: artifact.activityType === 'review' ? 'review' : 'first_take',
    targetId: artifact.id,
    tmdbId: artifact.tmdbId,
    mediaType: artifact.mediaType,
  };
}

function standaloneCommentToMurmur(item: ActivityFeedItem): FeedMurmur {
  return {
    id: item.id,
    commenterUserId: item.userId,
    commenterName: item.userDisplayName ?? 'someone',
    commenterAvatarUrl: item.userAvatarUrl,
    ownerName: item.targetReviewAuthorName ?? 'someone',
    ownerType: 'review',
    body: item.commentText ?? '',
    isSpoiler: item.isSpoiler ?? false,
    createdAt: item.createdAt,
    targetType: 'review',
    targetId: item.targetReviewId ?? '',
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
  };
}

/** An artifact and its (optional) attached top comment, or a standalone comment;
 * the unit that gets a perforation and a day bucket. */
type Thread =
  | { type: 'artifact'; sortMs: number; item: ActivityFeedItem; murmur: FeedMurmur | null }
  | { type: 'comment'; sortMs: number; murmur: FeedMurmur };

/**
 * Compose the flat, typed Feed v2 item list from the raw following/community
 * streams, attached top comments, and suggestion presence.
 *
 * Ordering & rules:
 *   • Artifacts (first_take|review) are the primary threads. "friends" uses only
 *     followed users' artifacts; the other filters union community first takes.
 *     "First Takes"/"Reviews" narrow by activity type.
 *   • Every artifact with a top comment carries it as an attached murmur
 *     (Decision 4). Standalone comment items whose parent artifact is already in
 *     the feed are dropped (their artifact already shows the top comment) — no
 *     double murmur. Standalone comments only appear under "all"/"friends".
 *   • Day eyebrows (TODAY/YESTERDAY/THIS WEEK/date) head each day bucket;
 *     perforations separate thread groups WITHIN a day.
 *   • "Shared taste" rail: after the 2nd artifact group when the feed is healthy
 *     (≥3 threads), promoted to the very top when thin (<3) (Decision 5).
 */
export function buildFeedV2Items(params: BuildFeedV2Params): FeedV2Item[] {
  const { followingItems, communityItems, topComments, railEnabled, adsEnabled = false, filter, now } = params;

  const followingArtifacts = followingItems.filter((i) => i.activityType !== 'comment');
  const followingComments = followingItems.filter((i) => i.activityType === 'comment');

  // Artifact pool by scope + type filter.
  let pool =
    filter === 'friends'
      ? [...followingArtifacts]
      : [...followingArtifacts, ...communityItems];
  if (filter === 'first_takes') pool = pool.filter((i) => i.activityType === 'first_take');
  else if (filter === 'reviews') pool = pool.filter((i) => i.activityType === 'review');

  // Dedup by id (community excludes followed users, but be defensive) + sort desc.
  const seen = new Set<string>();
  pool = pool
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => createdMs(b) - createdMs(a));

  const presentArtifactIds = new Set(pool.map((i) => i.id));

  const threads: Thread[] = pool.map((item) => {
    const tc = topComments.get(item.id);
    return {
      type: 'artifact' as const,
      sortMs: createdMs(item),
      item,
      murmur: tc ? topCommentToMurmur(tc, item) : null,
    };
  });

  // Standalone comment murmurs — only under "all"/"friends", and only when their
  // parent artifact is NOT already in the feed (else it carries its top comment).
  if (filter === 'all' || filter === 'friends') {
    for (const c of followingComments) {
      const parentId = c.targetReviewId ?? '';
      if (presentArtifactIds.has(parentId)) continue;
      threads.push({
        type: 'comment',
        sortMs: createdMs(c),
        murmur: standaloneCommentToMurmur(c),
      });
    }
  }

  threads.sort((a, b) => b.sortMs - a.sortMs);

  const railMode: 'none' | 'top' | 'after-second' = !railEnabled
    ? 'none'
    : threads.length < 3
      ? 'top'
      : 'after-second';

  const out: FeedV2Item[] = [];
  if (railMode === 'top') out.push({ kind: 'rail', key: 'rail' });

  let currentDayKey: string | null = null;
  // A perforation follows EVERY post (artifact group or standalone comment) —
  // between two posts in a day AND before the next day label, so each day reads
  // as a torn-off section. `pendingPerf` means "the previous post still needs its
  // trailing perforation, emitted just before the next post/day". The last post
  // never gets a trailing perf (nothing follows it). The rail/ad interludes sit
  // flush under their group (no perf framing) — they're not posts.
  let pendingPerf = false;
  let artifactGroupsEmitted = 0;
  let railPlaced = railMode !== 'after-second';

  for (const thread of threads) {
    const bucket = dayBucket(
      thread.type === 'artifact' ? thread.item.createdAt : thread.murmur.createdAt,
      now
    );
    if (bucket.key !== currentDayKey) {
      if (pendingPerf) out.push({ kind: 'perf', key: `perf-${bucket.key}` });
      out.push({ kind: 'day', key: bucket.key, label: bucket.label });
      currentDayKey = bucket.key;
    } else if (pendingPerf) {
      out.push({ kind: 'perf', key: `perf-${threadKey(thread)}` });
    }
    pendingPerf = false;

    if (thread.type === 'artifact') {
      out.push({ kind: 'artifact', key: `artifact-${thread.item.id}`, item: thread.item });
      if (thread.murmur) {
        out.push({ kind: 'murmur', key: `murmur-${thread.murmur.id}`, murmur: thread.murmur });
      }
      artifactGroupsEmitted++;
      if (!railPlaced && artifactGroupsEmitted === 2) {
        out.push({ kind: 'rail', key: 'rail' });
        railPlaced = true;
      }
      // Interleave a plain banner ad between thread groups after the cadence
      // hits (groups 3, 8, 13, …) — a monetization slot, no stub styling.
      if (
        adsEnabled &&
        artifactGroupsEmitted >= AD_FIRST_GROUP &&
        (artifactGroupsEmitted - AD_FIRST_GROUP) % AD_GROUP_INTERVAL === 0
      ) {
        out.push({ kind: 'ad', key: `ad-${artifactGroupsEmitted}` });
      }
    } else {
      out.push({ kind: 'murmur', key: `murmur-${thread.murmur.id}`, murmur: thread.murmur });
    }
    pendingPerf = true;
  }

  // Fallback: healthy feed with <2 artifact groups (e.g. mostly comments) —
  // append the rail rather than dropping it.
  if (!railPlaced && railMode === 'after-second') {
    out.push({ kind: 'rail', key: 'rail' });
  }

  return out;
}

function threadKey(thread: Thread): string {
  return thread.type === 'artifact' ? thread.item.id : thread.murmur.id;
}

/**
 * The FlatList data the Feed v2 screen should render. Blanks (→ empty array,
 * letting the empty/error/skeleton component own the frame) ONLY when there is
 * genuinely nothing to show:
 *   • while resolving/loading with no content (skeleton owns the frame), or
 *   • a hard error with NO already-loaded content.
 *
 * `isError` from usePrioritizedFeed is an OR across several queries, so a
 * background failure (e.g. the community page hard-fails) can flip it true while
 * following content loaded fine. In that case we KEEP the loaded feed — matching
 * the legacy feed, which never blanks good content on a background error. A rail
 * with no artifact/murmur content is not "content", so an error with only a rail
 * still surfaces the error state.
 */
export function selectFeedListData(
  items: FeedV2Item[],
  opts: { showSkeleton: boolean; isError: boolean }
): FeedV2Item[] {
  const hasContent = items.some((i) => i.kind === 'artifact' || i.kind === 'murmur');
  const hasRail = items.some((i) => i.kind === 'rail');
  if (opts.showSkeleton || (opts.isError && !hasContent)) return [];
  return hasContent || hasRail ? items : [];
}
