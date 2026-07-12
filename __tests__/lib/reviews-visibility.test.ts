import {
  resolveReviewVisibilities,
  filterReviewsByVisibility,
  type ReviewVisibility,
} from '../../lib/reviews-visibility';

const OWNER = 'owner-1';
const VIEWER = 'viewer-2';

function rev(visibility: ReviewVisibility, id: string = visibility) {
  return { id, visibility } as { id: string; visibility: ReviewVisibility };
}

// A profile with one review of each visibility.
const MIXED = [rev('public'), rev('followers_only'), rev('private')];

describe('resolveReviewVisibilities', () => {
  it('own profile (viewer === target) => null (no filter, see everything)', () => {
    expect(
      resolveReviewVisibilities({ viewerId: OWNER, targetUserId: OWNER, isFollowing: false }),
    ).toBeNull();
  });

  it('unauthenticated viewer => null (defer to RLS, which allows public only)', () => {
    expect(
      resolveReviewVisibilities({ viewerId: undefined, targetUserId: OWNER, isFollowing: false }),
    ).toBeNull();
    expect(
      resolveReviewVisibilities({ viewerId: null, targetUserId: OWNER, isFollowing: false }),
    ).toBeNull();
  });

  it('other profile + following => public + followers_only', () => {
    expect(
      resolveReviewVisibilities({ viewerId: VIEWER, targetUserId: OWNER, isFollowing: true }),
    ).toEqual(['public', 'followers_only']);
  });

  it('other profile + not following => public only', () => {
    expect(
      resolveReviewVisibilities({ viewerId: VIEWER, targetUserId: OWNER, isFollowing: false }),
    ).toEqual(['public']);
  });

  it('never exposes private to a non-owner, even when following', () => {
    const allowed = resolveReviewVisibilities({
      viewerId: VIEWER,
      targetUserId: OWNER,
      isFollowing: true,
    });
    expect(allowed).not.toContain('private');
  });
});

describe('filterReviewsByVisibility — count agrees with the visible list', () => {
  it('own profile sees all reviews incl. private (count === list length)', () => {
    const visible = filterReviewsByVisibility(MIXED, {
      viewerId: OWNER,
      targetUserId: OWNER,
      isFollowing: false,
    });
    expect(visible).toHaveLength(3);
    expect(visible.map((r) => r.visibility)).toEqual(['public', 'followers_only', 'private']);
  });

  it('follower sees public + followers_only — this is the 6-vs-8 bug case', () => {
    // Two public + one followers_only + one private: list shows 3, count must be 3.
    const set = [rev('public', 'a'), rev('public', 'b'), rev('followers_only', 'c'), rev('private', 'd')];
    const visible = filterReviewsByVisibility(set, {
      viewerId: VIEWER,
      targetUserId: OWNER,
      isFollowing: true,
    });
    expect(visible).toHaveLength(3);
    expect(visible.some((r) => r.visibility === 'private')).toBe(false);
    expect(visible.some((r) => r.visibility === 'followers_only')).toBe(true);
  });

  it('non-follower sees only public (count === public list length)', () => {
    const visible = filterReviewsByVisibility(MIXED, {
      viewerId: VIEWER,
      targetUserId: OWNER,
      isFollowing: false,
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].visibility).toBe('public');
  });

  it('a follower who unfollows loses the followers_only rows from the count', () => {
    const following = filterReviewsByVisibility(MIXED, {
      viewerId: VIEWER,
      targetUserId: OWNER,
      isFollowing: true,
    });
    const notFollowing = filterReviewsByVisibility(MIXED, {
      viewerId: VIEWER,
      targetUserId: OWNER,
      isFollowing: false,
    });
    expect(following.length).toBeGreaterThan(notFollowing.length);
    expect(following).toHaveLength(2);
    expect(notFollowing).toHaveLength(1);
  });
});
