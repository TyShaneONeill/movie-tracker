# PRD: Reviews — Full Feature Suite

**Status**: Phase 1 Complete (2026-03-04)
**Author**: CineTrak Team
**Created**: 2026-03-03
**Target Release**: Phased (v1.x → v2.x)

---

## 1. Problem Statement

CineTrak's "First Takes" feature captures quick reactions (1-10 rating + 140-char quote) when users mark a movie as watched. While this works as a lightweight journaling tool, it falls short of a full review system:

- **Too constrained**: 140 characters isn't enough for users who want to articulate thoughts
- **No engagement**: No likes, comments, or replies — reviews are fire-and-forget
- **No discovery**: No way to browse popular or friends' reviews on a movie page
- **No social proof**: Movie detail pages show external ratings (IMDb, RT, MC) but zero community voice
- **No viral loops**: Reviews can't be shared as cards on social media
- **No profile showcase**: Users can't pin reviews or display taste beyond a list of First Takes

Competitors like Letterboxd have proven that a casual, social review system drives massive engagement (1.8M → 17M users in 4 years). The key insight: **low barrier to entry + social engagement + taste showcase = growth flywheel**.

## 2. Vision

Transform CineTrak from a tracking app into a **social movie companion** where your taste is your identity, reviews spark conversation, and every interaction drives discovery.

## 3. Design Principles

1. **Casual over formal** — One-liners are as valid as essays. No minimums, no pressure.
2. **Engagement over ratings** — Likes, comments, and discussion matter as much as the number.
3. **Spoiler-safe by default** — One spoiler incident = user churn. Gate everything behind watched status.
4. **Build on First Takes** — Don't replace what works. Extend it.
5. **Gate phases on real data** — Don't build Phase 3 until Phase 2 proves users want it.

## 4. Competitive Landscape Summary

| Platform | Strength | Weakness | CineTrak Opportunity |
|----------|----------|----------|----------------------|
| **Letterboxd** | Witty culture, casual reviews, "Four Favorites" viral feature, Year-in-Review | Movies only, no TV shows, no episode tracking | Full movie + TV coverage |
| **IMDb** | Scale, per-episode ratings, comprehensive database | Opaque algorithms, fake reviews, no social | Transparent, trust-based system |
| **Rotten Tomatoes** | Critic/audience split, verification via Fandango | Broken credibility, review bombing, cluttered UI | Clean mobile-first UX |
| **Serializd** | Episode-level spoiler gating, TV-first | TV only, small community, no movies | Combined movie + TV social platform |
| **TV Time** | Episode tracking, emotion tags, binge stats | Badge bugs, weak recommendations | Reliable gamification + smart recs |
| **Flick** | Visual "this or that" comparisons, fast rating | Shallow reviews, limited social | Quick reactions + depth when wanted |

**CineTrak's unique position**: The only app combining movie + TV tracking, per-episode reviews, external ratings aggregation, and social features in a single mobile-first experience.

---

## 5. Phased Implementation

### PHASE 1: Enhanced Reviews ✅ COMPLETE (2026-03-04, PR #220)
**Goal**: Make reviews worth writing and worth reading.

#### 1.1 Features

**Extend First Takes into Reviews**:
- Increase quote text limit from 140 → 500 characters
- Add optional review title field (max 100 chars)
- Allow rating without text (star-only entries)
- Allow text without rating (commentary-only entries)
- Add "Rewatch" flag (logged this movie before)
- Preserve backward compatibility — existing First Takes remain valid

**Friends' Ratings on Movie Detail Page**:
- New section: "Friends who watched" showing avatars + ratings
- Display friends' average rating (e.g., "Your friends average 7.8/10")
- Tap any friend's rating to read their full review
- Only shows friends who have public or followers_only visibility

**Reviews Section on Movie Detail Page**:
- New tab/section: "Community Reviews" below external ratings
- Show top 3-5 reviews sorted by engagement (once likes exist, fallback to recency)
- "View all reviews" links to full reviews list
- Spoiler reviews hidden behind blur + tap-to-reveal

#### 1.2 Technical Scope

**Database changes**:
```sql
-- Extend first_takes
ALTER TABLE first_takes
  ALTER COLUMN quote_text TYPE VARCHAR(500),
  ADD COLUMN IF NOT EXISTS title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_rewatch BOOLEAN DEFAULT FALSE;
```

**New edge function**: `get-movie-reviews`
- Accepts `{ tmdb_id, page?, limit? }`
- Returns reviews for a movie, sorted by recency (Phase 1) then engagement (Phase 2+)
- Includes reviewer profile info (avatar, display name)
- Filters by visibility rules
- Supports pagination

**New edge function**: `get-friends-ratings`
- Accepts `{ tmdb_id, user_id }`
- Returns list of followed users who rated this movie
- Includes their rating, quote, avatar
- Computes average rating

**Client changes**:
- Update `FirstTakeModal` to support 500 chars + title + rewatch flag
- New `FriendsRatings` component for movie detail page
- New `CommunityReviews` component for movie detail page
- Update `hooks/use-first-take-actions.ts` for new fields

#### 1.3 Phase Gate — Must achieve ALL before proceeding to Phase 2

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Edge functions deployed & healthy** | `get-movie-reviews` and `get-friends-ratings` return 200 for valid requests, proper error codes for invalid | Automated smoke tests against production endpoints |
| **Cache layer working** | Friends' ratings and community reviews serve from cache on repeat loads; cache invalidates when new review is written | Verify via edge function logs: cache hit rate > 0 on second load |
| **Pagination correct** | Community reviews paginate without duplicates or missing entries across pages | Manual QA: write 15+ reviews on one movie, verify all pages load correctly |
| **Visibility rules enforced** | Private reviews never leak to other users; followers_only reviews only visible to followers; public visible to all | Automated test: create reviews with each visibility, verify from 3 perspectives (author, follower, stranger) |
| **Spoiler gating works** | Spoiler-flagged reviews are blurred on movie detail and feed; tap-to-reveal works; spoiler state persists per session | Manual QA on iOS, web |
| **Backward compatibility** | Existing First Takes (140 char, no title) render correctly everywhere; no data migration issues | Query for existing First Takes, verify they display in new UI without errors |
| **Dark/light mode** | All new components (FriendsRatings, CommunityReviews, updated FirstTakeModal) render correctly in both themes | Visual QA on iOS + web in both modes |
| **CI green** | Lint, TypeScript, unit tests, E2E tests all pass | CI pipeline on PR |
| **Performance** | Movie detail page loads in < 2s on 3G; reviews section doesn't block initial render (loads independently) | Lighthouse audit or manual test on throttled connection |
| **Error states** | Empty states ("No reviews yet", "No friends have watched this"), network errors, and loading skeletons all render correctly | Manual QA: test with no data, with network off, during loading |

**Why these gates**: Phase 1 must be production-grade before we layer social engagement on top. Likes on broken reviews create a broken experience squared.

#### 1.4 What Was Built (Phase 1 Delivery)

| Component | File(s) | Notes |
|-----------|---------|-------|
| DB migration | `extend_first_takes_for_reviews` | `quote_text` → VARCHAR(500), added `title` VARCHAR(100), `is_rewatch` BOOLEAN |
| Edge function | `supabase/functions/get-movie-reviews/index.ts` | Paginated public reviews with profiles, IP rate limit 100/hr |
| Edge function | `supabase/functions/get-friends-ratings/index.ts` | Auth required, returns followed users' ratings + average, user rate limit 200/hr |
| Service layer | `lib/review-service.ts` | `fetchMovieReviews()`, `fetchFriendsRatings()` |
| Hooks | `hooks/use-movie-reviews.ts`, `hooks/use-friends-ratings.ts` | React Query with 5min stale, auth-gated for friends |
| FirstTakeModal | `components/first-take-modal.tsx` | 500-char text, title field, rewatch toggle, rating-only/text-only support |
| FriendsRatings | `components/movie-detail/friends-ratings.tsx` | Horizontal avatars, color-coded ratings, average badge |
| CommunityReviews | `components/movie-detail/community-reviews.tsx` | Review cards, spoiler blur, rewatch tags, pagination |
| Integration | `app/movie/[id].tsx` | Both components wired below external ratings and action grid |
| Types | `lib/database.types.ts` | Added `title`, `is_rewatch` to Row/Insert/Update |
| Service updates | `lib/first-take-service.ts`, `hooks/use-first-take-actions.ts` | Support for new fields |

---

### PHASE 1.5: Profile Reviews & Review Detail
**Goal**: Give reviews a home on the profile page and a dedicated reading experience. Reviews deserve their own spotlight — not buried in a mixed list with First Takes.

#### 1.5.1 Features

**New "Reviews" Tab on Profile Page**:
- Add a 4th tab to the profile tab bar: `Watched | First Takes | Reviews | Lists`
- Tab shows count badge (e.g., "6 Reviews")
- **Reviews only** — no First Takes mixed in. First Takes stay on their own tab.
- Each review card shows:
  - Movie/TV show poster thumbnail (left, ~50x75px)
  - Movie/show title (bold) + relative timestamp (e.g., "3d ago")
  - Review title (medium weight)
  - Rating badge (color-coded circle: green 8-10, yellow 6-7, red 1-5)
  - Review body text **truncated to 100 characters** with "..." — tap card to see full review
  - Visibility icon (globe for public, people for followers_only, lock for private)
  - Spoiler overlay (blur + "Tap to reveal") for spoiler-flagged reviews
- **Pill tags** at bottom of each review card:
  - "Rewatch" pill (gold) if `is_rewatch` is true
  - Space reserved for future "Like" and "Share" action pills (Phase 2+)
- Cards separated by hairline border

**Sort Options**:
- Dropdown at top-right of the reviews list
- Options: **Recent** (default), **Highest Rated**, **Lowest Rated**
- Sort is client-side since review count per user is small (< 100 typically)

**Media Type Filter**:
- Toggle/segmented control: **All** | **Movies** | **TV Shows**
- Filters the reviews list by `media_type` field ('movie' vs 'tv_show')
- Filter persists within session, resets on tab switch

**Review Detail Page** (`app/review/[id].tsx`):
- Full-screen dedicated page for reading a single review
- Layout similar to movie detail page but focused on the review:
  - Movie/show poster + title + year at top
  - Reviewer info (avatar, display name, timestamp)
  - Full rating display (large, color-coded)
  - Review title (if present)
  - **Full review text** (no truncation — up to 2000 characters)
  - Spoiler warning banner if flagged
  - "Rewatch" indicator
  - Visibility badge
  - Navigation: back button returns to profile
- Accessible via:
  - Tapping any review card on the profile Reviews tab
  - Tapping any review card in the CommunityReviews section on movie detail
  - Deep link: `/review/{id}` (for future sharing, Phase 3)
- Error states: 404 for deleted reviews, 403 for private reviews when not the author

**Empty State**:
- "No reviews yet — start sharing your thoughts!" with a subtle film icon
- Optional CTA button linking to the user's watched movies (to encourage writing reviews)

#### 1.5.2 Technical Scope

**New hook**: `useUserReviews(userId)`
- Fetches reviews from `reviews` table for a given user
- Returns `{ reviews, isLoading, isError }`
- Query key: `['user-reviews', userId]`
- Sorted by `created_at DESC` by default
- Filters by visibility (own profile: all; other user's profile: public + followers_only if following, public only otherwise)

**New hook**: `useReviewDetail(reviewId)`
- Fetches a single review by ID with reviewer profile info
- Query key: `['review', reviewId]`
- Returns full review data + movie info for display

**New components**:
- `components/cards/review-card.tsx` — Profile review card with truncation, tags, rating badge
- `components/profile/reviews-tab.tsx` — Reviews tab content with sort + filter
- `app/review/[id].tsx` — Review detail screen

**Profile tab update**:
- `app/(tabs)/profile.tsx` — Add 'reviews' to `TabType` and `TAB_CONFIG`
- New stat query to count user's reviews

**No new edge functions needed** — reviews are in the `reviews` table with RLS policies; client can query directly via Supabase for the user's own profile. For viewing other users' reviews, the existing `get-movie-reviews` pattern can be extended or a new `get-user-reviews` edge function added if needed.

**No database changes needed** — the `reviews` table already has all required fields: `id`, `user_id`, `tmdb_id`, `media_type`, `movie_title`, `poster_path`, `title`, `review_text`, `rating`, `is_spoiler`, `is_rewatch`, `visibility`, `created_at`.

#### 1.5.3 Phase Gate — Must achieve ALL before proceeding to Phase 2

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Reviews tab renders correctly** | Profile shows 4 tabs; Reviews tab displays only reviews (no First Takes); count badge is accurate | Manual QA: user with 3 reviews and 5 First Takes should show "3" on Reviews tab |
| **100-char truncation works** | Reviews with > 100 characters show truncated text with "..."; reviews with ≤ 100 characters show full text; tapping navigates to detail page | Test with reviews of varying lengths: 50, 100, 101, 500, 2000 chars |
| **Review detail page loads** | `/review/{id}` loads full review with all metadata; handles missing review (404); handles private review (403 for non-author) | Navigate to valid, deleted, and private reviews |
| **Sort works** | All 3 sort options (Recent, Highest, Lowest) reorder the list correctly | Write 5 reviews with different ratings and dates; verify each sort |
| **Media type filter works** | Toggling Movies/TV Shows/All correctly filters the list; counts update | Write reviews for both movies and TV shows; verify filter |
| **Visibility rules enforced** | Viewing another user's profile only shows public reviews (+ followers_only if following); private reviews never leak | Test from 3 perspectives: author, follower, stranger |
| **Spoiler gating works** | Spoiler reviews are blurred on the Reviews tab; tap-to-reveal works; full review on detail page also has spoiler gate | Test with spoiler-flagged reviews on both tab and detail page |
| **Dark/light mode** | Review cards, detail page, sort/filter controls all render correctly in both themes | Visual QA on iOS + web |
| **Navigation works** | Back button from review detail returns to correct context (profile or movie detail); deep link `/review/{id}` resolves | Test navigation from both entry points |
| **CI green** | Lint, TypeScript, unit tests all pass | CI pipeline |

**Why these gates**: The profile Reviews tab and review detail page are the foundation for Phase 2's likes and Phase 3's comments. The detail page URL structure must be correct from day one since it becomes the permalink for sharing.

#### 1.5.4 UI Reference

- Mock: `ui-mocks/profile_reviews.html` (Gemini-generated, adapted for reviews-only)
- Design system: Dark theme (`#121212` bg, `#1E1E1E` cards, `#E63946` accent), 768px max-width on web
- Review card layout: poster left, content right, rating badge top-right, pill tags bottom

---

### PHASE 2: Social Engagement
**Goal**: Make reviews feel alive. Prove reviews drive return visits.

#### 2.1 Features

**Likes on Reviews**:
- Heart button on every review (feed items, movie detail, profile)
- Like count displayed
- "Liked by [friend name] and X others" indicator
- Liking sends a notification to the reviewer (if notifications enabled)
- Users can see all reviews they've liked in their profile

**Review Sorting by Engagement**:
- Movie detail reviews now sorted by: Popular (likes + comments), Recent, Friends First
- Default sort: Friends First (shows followed users' reviews at top, then popular)

**Notifications (Lightweight)**:
- "X liked your review of [Movie]"
- "X reviewed [Movie] — you also watched this"
- In-app notification bell only (no push yet — push is a separate PRD)
- Notification badge on profile tab

#### 2.2 Technical Scope

**New table**: `review_likes`
```sql
CREATE TABLE review_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_take_id UUID NOT NULL REFERENCES first_takes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, first_take_id)
);

-- Denormalized count on first_takes for fast reads
ALTER TABLE first_takes ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
```

**New table**: `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'review_liked', 'friend_reviewed', etc.
  actor_id UUID REFERENCES auth.users(id),
  target_id UUID, -- first_take_id, etc.
  tmdb_id INTEGER,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Edge functions**: `like-review`, `unlike-review`, `get-notifications`

**Client changes**:
- Like button component (animated heart, optimistic update)
- Notification bell + notification list screen
- Updated review sorting in `CommunityReviews` component
- Like count on `FeedItemCard` and `FirstTakeCard`

#### 2.3 Phase Gate — Must achieve ALL before proceeding to Phase 3

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Like/unlike is atomic** | Like and unlike operations are idempotent; rapid double-taps don't create duplicate rows or negative counts; `like_count` stays in sync with actual `review_likes` rows | Stress test: 50 rapid like/unlike toggles on same review; verify count matches row count |
| **Optimistic UI with rollback** | Like button updates instantly on tap; if the server call fails, the UI reverts to previous state with a subtle error indicator | Test on throttled 3G: like a review, kill network mid-request, verify rollback |
| **Denormalized counts accurate** | `first_takes.like_count` always matches `SELECT COUNT(*) FROM review_likes WHERE first_take_id = X` | Automated check: compare denormalized vs actual for all reviews with likes |
| **Notification delivery reliable** | All like/review notifications are created within 5s of the triggering action; no duplicates; marking as read persists | Like a review → verify notification appears for author within 5s; tap it → verify read state persists |
| **Notification pagination** | Notification list loads incrementally (cursor pagination); doesn't load all history at once; unread badge count is accurate | Create 50+ notifications, verify pagination works, verify badge shows correct unread count |
| **Sort modes work correctly** | "Popular", "Recent", and "Friends First" sort orders return correct results; switching sorts doesn't duplicate or lose reviews | Write reviews with known like counts and timestamps, verify each sort returns expected order |
| **Cascade deletes clean** | Deleting a review removes all associated likes and notifications; deleting a user removes all their likes, notifications, and reviews | Delete a review with 10 likes and 3 notifications → verify all related rows gone |
| **RLS policies correct** | Users can only like/unlike their own likes; can only see notifications for themselves; cannot manipulate other users' like counts | Test via Supabase client with different user JWTs |
| **Dark/light mode** | Like button animation, notification bell badge, notification list all render correctly in both themes | Visual QA on iOS + web |
| **CI green** | All existing + new unit tests pass; E2E tests pass; lint + TypeScript clean | CI pipeline |
| **Performance** | Liking a review completes in < 500ms (server round-trip); notification list loads in < 1s | Test against production edge functions |

**Why these gates**: Social engagement features have the highest surface area for race conditions, stale state, and data integrity bugs. Every like/unlike must be bulletproof before we add comments on top.

---

### PHASE 3: Conversation
**Goal**: Turn reviews into discussions. Prove CineTrak is where movie conversations happen.

**Implementation**: Split into 3 sub-PRs to keep scope manageable:
- **Phase 3A**: Comments (DB, edge functions, threaded UI, notifications, moderation)
- **Phase 3B**: Sharing (share card image generation, native share sheet, deep links, OG meta)
- **Phase 3C**: Feed enhancements (comment feed items, feed filters, "caught up" indicator)

---

#### PHASE 3A: Comments on Reviews

**Goal**: Let users discuss reviews. Threaded replies, spoiler gating, and moderation.

##### 3A.1 Features

**Comments on Reviews**:
- Threaded replies on any review (max 2 levels deep)
- Comment count displayed on review cards
- Reply notifications sent to review author + parent comment author
- Spoiler flag on individual comments (blur + tap-to-reveal)
- Comment moderation: report button, auto-hide after N reports
- Delete own comments

##### 3A.2 Technical Scope

**New table**: `review_comments`
```sql
CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
  first_take_id UUID REFERENCES first_takes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES review_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  is_spoiler BOOLEAN DEFAULT FALSE,
  report_count INTEGER DEFAULT 0,
  is_hidden BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT comment_target_check CHECK (
    (review_id IS NOT NULL AND first_take_id IS NULL) OR
    (review_id IS NULL AND first_take_id IS NOT NULL)
  )
);

-- Denormalized counts
ALTER TABLE first_takes ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- Trigger to maintain comment_count
CREATE OR REPLACE FUNCTION update_comment_count() ...
```

**New table**: `comment_reports`
```sql
CREATE TABLE comment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, reporter_id)
);
```

**Edge functions**:
- `add-comment` — Create comment with auth, rate limit 30/hr, notification creation
- `get-comments` — Fetch threaded comments for a review/first_take (public, IP rate limited)
- `report-comment` — Report a comment, auto-hide after 3 reports

**Client changes**:
- `lib/comment-service.ts` — Service layer for comment CRUD
- `hooks/use-comments.ts` — React Query hook for fetching comments + mutations
- `components/comments/comment-thread.tsx` — Threaded comment display (2 levels max)
- `components/comments/comment-input.tsx` — Comment input with spoiler toggle
- `components/comments/comment-item.tsx` — Single comment with reply/report/delete actions
- Update `app/review/[id].tsx` — Add comments section below review
- Update `components/cards/review-card.tsx` — Show comment count
- Update `components/movie-detail/community-reviews.tsx` — Show comment count
- Update `components/social/NotificationItem.tsx` — Handle 'comment' notification type
- Update `app/notifications.tsx` — Navigation for comment notifications

##### 3A.3 Phase Gate

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Threaded comments render correctly** | Replies nest under parent comments (max 2 levels deep); thread collapse/expand works; deleted parent shows "[deleted]" with children preserved | Manual QA: create 3-level thread, delete middle comment, verify children still visible |
| **Comment count accurate** | `comment_count` matches actual row count in `review_comments`; increments on add, decrements on delete | Automated check: add 5 comments, delete 2, verify count = 3 matches actual rows |
| **Spoiler comments gated** | Spoiler-flagged comments are blurred; revealing one doesn't reveal others; spoiler flag persists on page reload | QA: flag 2 of 5 comments as spoilers, reveal one, verify other stays blurred, reload page |
| **Report/moderation flow works** | Report button creates a report entry; auto-hides comment after 3 reports from different users | Test: report comment 3 times from different accounts → verify auto-hide |
| **Notifications delivered** | Comment on someone's review → they get notified; reply to a comment → both review author and parent comment author get notified | Verify notifications appear within 5s |
| **Cascade deletes clean** | Deleting a review removes all comments + notifications; deleting a comment removes child comments | Full cascade test |
| **Rate limiting** | Comments rate limited to 30/hour per user | Hit rate limit → verify 429 response |
| **Dark/light mode** | Comment thread renders correctly in both themes | Visual QA on iOS + web |
| **CI green** | All tests pass; lint + TypeScript clean | CI pipeline |

---

#### PHASE 3A.5: Comment Engagement

**Goal:** Instagram-style engagement on review comments — likes, "liked by author" badges, and collapsible threaded replies.

**Phase gate (from 3A):** Comments system live and stable.

##### 3A.5.1 Features

**Comment Likes**
- Heart icon + like count on every comment and reply (right side, Instagram-style layout)
- Toggle like/unlike with optimistic UI
- Notification to comment author on new like: "X liked your comment on [Movie Title]"
- Rate limited: 200 likes/hour per user

**"Liked by Author" Badge**
- When the review/first-take author likes a comment on their own content, display a red heart badge: `❤️ by author`
- Badge shown inline next to username and timestamp
- `liked_by_author` boolean maintained by DB trigger — no extra queries needed
- Works for both top-level comments and replies

**Collapsible Threaded Replies**
- All replies collapsed by default
- "View X more replies" / "View 1 more reply" link with dash-line prefix (Instagram-style)
- Tap to expand, tap "Hide replies" to collapse
- Smooth expand/collapse UX

##### 3A.5.2 Database Changes

**New table: `comment_likes`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, gen_random_uuid() |
| `user_id` | uuid | FK → auth.users, NOT NULL |
| `comment_id` | uuid | FK → review_comments, NOT NULL |
| `created_at` | timestamptz | NOT NULL, default now() |

Unique constraint: `(user_id, comment_id)`

**New columns on `review_comments`:**
| Column | Type | Notes |
|--------|------|-------|
| `like_count` | integer | Default 0, maintained by trigger |
| `liked_by_author` | boolean | Default false, maintained by trigger |

**Trigger:** `trg_comment_likes_count` — on INSERT/DELETE to `comment_likes`, updates `like_count` and checks if the liker is the content author to set `liked_by_author`.

##### 3A.5.3 Edge Functions

| Function | Auth | Description |
|----------|------|-------------|
| `like-comment` | Required | Toggle like on a comment; returns `{ liked, likeCount, likedByAuthor }` |
| `get-comments` (updated) | Optional | Now includes `likeCount`, `likedByAuthor`, `isLikedByMe` per comment |

##### 3A.5.4 Frontend Components

| Component | Changes |
|-----------|---------|
| `comment-item.tsx` | Heart icon + count on right, "❤️ by author" badge, `onLike` prop |
| `comment-thread.tsx` | Collapsible reply threads, expand/collapse state |
| `comment-service.ts` | `likeComment()` function, updated `CommentItem` type |
| `use-comments.ts` | `likeComment` mutation with optimistic update |

##### 3A.5.5 Phase Gate → 3B

- [ ] Comment likes working end-to-end (like/unlike/count/badge)
- [ ] "Liked by author" badge renders correctly for author-liked comments
- [ ] Reply threads collapsible with correct counts
- [ ] No regression in existing comment CRUD

---

#### PHASE 3B: Review Sharing

**Goal**: Let users share reviews as beautiful cards on social media.

##### 3B.1 Features

**Review Sharing**:
- "Share" button generates a beautiful review card image (movie poster + rating + quote + username)
- Share via native share sheet (Instagram Stories, Twitter, iMessage, etc.)
- Shared card includes CineTrak branding + deep link back to review
- Web URL for each review: `cinetrak.app/review/{id}` (public reviews only)

##### 3B.2 Technical Scope

**New service**: `lib/share-service.ts` (generate review card image using react-native-view-shot or canvas)
**Deep links**: Static HTML page generation for `/review/{id}` with OG meta tags
**Share button**: Add to `app/review/[id].tsx` and `components/cards/review-card.tsx`

##### 3B.3 Phase Gate

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Share card generation** | Review share card renders correctly with movie poster, rating, quote text, and CineTrak branding | Generate cards for: short review, long review (500 chars), review with special characters/emoji |
| **Deep links resolve** | `cinetrak.app/review/{id}` loads the review on web with OG meta tags for social preview | Share a review URL on Twitter/iMessage → verify card renders |
| **Native share sheet** | Share sheet opens on iOS with the generated image + URL | Test on iOS simulator + web |
| **Rate limiting** | Share card generation rate limited to 20/hour | Hit rate limit → verify 429 response |

---

#### PHASE 3C: Enhanced Activity Feed

**Goal**: Make the activity feed richer with comment activity and filtering.

##### 3C.1 Features

**Enhanced Activity Feed**:
- Feed now shows: reviews, likes, comments, follows
- "X commented on Y's review of [Movie]" feed items
- Feed filters: All, Reviews Only, Friends Only
- "Caught up" indicator when you've seen all new activity

##### 3C.2 Technical Scope

- Update `components/cards/feed-item-card.tsx` — Handle 'comment' feed items
- Update activity feed queries — Include comment activity
- Add filter pills to feed screen
- Add "You're all caught up" divider based on last-seen timestamp
- Update `lib/activity-feed-service.ts` or equivalent

##### 3C.3 Phase Gate

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Feed integration** | Comment activity appears in followers' feeds ("X commented on Y's review"); feed doesn't duplicate entries on rapid comments | Write 3 comments quickly → verify feed shows correct entries without duplicates |
| **Feed filters work** | All/Reviews Only/Friends Only filters correctly filter the feed | Toggle each filter, verify correct results |
| **Caught up indicator** | "You're all caught up" appears at the correct position in the feed | Scroll past all new items → verify indicator position |
| **Dark/light mode** | Feed filters and caught up indicator render correctly in both themes | Visual QA |

---

**Overall Phase 3 Gate** — Must achieve ALL sub-phase gates before proceeding to Phase 4.

---

### PHASE 4: Profile & Taste Showcase
**Goal**: Make profiles worth visiting. Your taste becomes your identity.

#### 4.1 Features

**Four Favorites**:
- Users select 4 favorite movies displayed prominently at top of profile
- Tap to edit/rearrange
- Viral potential (Letterboxd proved this drives TikTok/Twitter engagement)
- Optional: 4 favorite TV shows as a separate row

**Review Stats (Premium)**:
- Total reviews written, average rating, most-reviewed genres
- Rating distribution chart (how many 1s, 2s, 3s... 10s)
- "Harshest critic" vs "Easiest grader" indicator based on average vs community average
- Monthly/yearly breakdown
- Top directors, actors, genres reviewed

**Pinned Reviews (Premium)**:
- Pin up to 3 reviews to profile (showcases your best writing)
- Pinned reviews appear above the reviews list

**Year in Review**:
- Auto-generated annual stats summary
- Total movies/shows watched, hours spent, top genres, highest-rated, most-reviewed
- Shareable card for social media (growth driver)
- Available in January for previous year

#### 4.2 Technical Scope

**Database changes**:
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favorite_movies INTEGER[] DEFAULT '{}', -- array of tmdb_ids (max 4)
  ADD COLUMN IF NOT EXISTS favorite_tv_shows INTEGER[] DEFAULT '{}', -- array of tmdb_ids (max 4)
  ADD COLUMN IF NOT EXISTS pinned_reviews UUID[] DEFAULT '{}'; -- array of first_take_ids (max 3)
```

**Edge functions**: `update-favorites`, `get-year-in-review`
**Components**: `FourFavorites`, `ReviewStats`, `YearInReview`
**Premium gating**: Stats and pinned reviews behind premium tier

#### 4.3 Phase Gate — Must achieve ALL before proceeding to Phase 5

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Four Favorites CRUD** | Users can set, reorder, and remove favorites; max 4 movies + 4 TV shows enforced at DB level; poster images load from TMDB cache | Set 4 favorites → reorder → remove one → add new one → verify all states persist across app restart |
| **Favorites display on profile** | Other users see your Four Favorites when viewing your profile; empty state shows placeholder prompting user to set favorites | View own profile, view other user's profile (with and without favorites set) |
| **Pinned reviews (premium)** | Free users see "Upgrade to pin reviews" prompt; premium users can pin up to 3; pinned reviews appear above review list on profile; unpinning works | Test as free user (verify prompt), test as premium user (pin 3, try to pin 4th, unpin one) |
| **Review stats accuracy** | Total reviews, average rating, rating distribution, genre breakdown all compute correctly from actual `first_takes` data | Create known set of reviews (5 movies, specific ratings/genres) → verify all stats match expected values |
| **Review stats premium gate** | Free users see a blurred/teaser version of stats with upgrade CTA; premium users see full stats; downgrading hides stats again | Test as free user, upgrade, verify access, simulate tier expiry, verify stats re-locked |
| **Year in Review generation** | Generates correct annual summary from user's watch history; handles edge cases (user with 0 watches, user with 1 watch, user with 500+ watches) | Generate Year in Review for users with varying activity levels; verify all stats compute correctly |
| **Year in Review share card** | Share card renders with correct stats, top movies, and CineTrak branding; works on iOS share sheet and web; OG meta tags for social previews | Generate + share for multiple users; verify card renders correctly with different data volumes |
| **Profile performance** | Profile page with Four Favorites + pinned reviews + stats loads in < 2s; no layout shift as data loads (skeleton → content) | Test on throttled connection; verify no content jumping |
| **Dark/light mode** | Four Favorites grid, stats charts, Year in Review card all render correctly in both themes | Visual QA on iOS + web |
| **CI green** | All tests pass; lint + TypeScript clean | CI pipeline |

**Why these gates**: Profile features are the public face of a user's account. Stats must be accurate (wrong data destroys trust), premium gating must be airtight (leaking premium features kills revenue), and share cards must look polished (they represent CineTrak's brand externally).

---

### PHASE 5: Discovery & Growth
**Goal**: Reviews become a reason to open CineTrak, not just a byproduct of tracking.

#### 5.1 Features

**Popular Reviews Feed**:
- Dedicated "Discover" section showing trending reviews across the community
- Filterable by genre, recency, rating range
- "Hot Takes" section: reviews where the user's rating diverges significantly from the community average
- "Divisive" badge on movies where ratings are bimodal (people love or hate it)

**Reviewer Profiles**:
- "Top reviewers" leaderboard by genre
- Follow suggestions based on similar taste (users who rated the same movies similarly)
- "Reviewed by people you follow" indicator on movie cards

**TV Episode Reviews (Enhanced)**:
- Episode-level review feed (what friends thought of last night's episode)
- Spoiler gating tied to user's watched progress (if you haven't seen S2E5, reviews for it are hidden)
- Season summary review (rate the season as a whole after finishing)
- "Episode rankings" — community-voted best episodes per series

**Search & Explore**:
- Search for users by name
- Browse reviews by movie, genre, or reviewer
- "Movies your friends loved that you haven't seen" recommendation engine

#### 5.2 Technical Scope

**New edge functions**: `get-popular-reviews`, `get-hot-takes`, `get-follow-suggestions`, `get-episode-rankings`
**New components**: `DiscoverFeed`, `HotTakes`, `FollowSuggestions`, `EpisodeRankings`
**Algorithm**: Simple engagement scoring (likes × 1 + comments × 3 + shares × 5, decayed by age)

#### 5.3 Phase Gate — Ongoing (this is the final phase, so gates are operational health checks)

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Engagement scoring algorithm** | Scoring formula (likes × 1 + comments × 3 + shares × 5, time-decayed) produces sensible rankings; new reviews can surface above older popular ones; no single review dominates indefinitely | Seed test data with known engagement patterns → verify ranking order matches expected output |
| **Popular reviews feed loads fast** | Discover feed loads in < 1.5s with 50+ reviews; infinite scroll pagination works without duplicates | Load test: generate 500 reviews with varying engagement → verify feed paginates correctly |
| **Hot Takes detection accurate** | "Hot Takes" correctly identifies reviews where user rating diverges 3+ points from community average; doesn't flag movies with < 10 total reviews (insufficient data) | Create reviews with known divergence patterns → verify only correct ones get "Hot Take" label |
| **Follow suggestions relevant** | Suggestions based on taste similarity (overlapping movie ratings) return meaningful results; users with no rating overlap don't appear; suggestions update as user rates more movies | Create 3 users with known taste profiles → verify suggestions match expected similarity |
| **Episode rankings correct** | Community-voted best episodes sorted correctly; handles ties; updates in real-time as new ratings come in | Rate episodes of a known series with specific ratings → verify ranking order |
| **Spoiler gating for TV discovery** | Episode reviews hidden based on user's watched progress; user who watched S1E1-E5 doesn't see reviews for S1E6+ | Mark specific episodes as watched → verify review visibility matches exactly |
| **User search works** | Search by display name returns results in < 500ms; handles partial matches, special characters, and empty results | Search for existing user (partial name), non-existent user, special characters |
| **Recommendation engine** | "Movies your friends loved that you haven't seen" returns correct results; excludes movies in user's watchlist/watched; handles user with no friends (empty state) | Create friend network with known ratings → verify recommendations match expected output |
| **Performance at scale** | All discovery endpoints handle 100+ concurrent requests without degradation; DB queries use proper indexes | Load test against production endpoints |
| **Dark/light mode** | All discovery screens render correctly in both themes | Visual QA |
| **CI green** | All tests pass | CI pipeline |

**Why these gates**: Discovery features run complex queries across the entire user base. Algorithm correctness, query performance, and spoiler safety must be verified at scale — a bad recommendation or spoiler in the discover feed affects every user, not just one.

---

## 6. TV Show Review Strategy

TV reviews are woven throughout all phases, but deserve specific callout:

| Level | When Available | How It Works |
|-------|---------------|--------------|
| **Episode review** | Phase 1 | User reviews individual episodes (already supported via First Takes) |
| **Season review** | Phase 1 | New: "Rate this season" prompt after marking final episode watched |
| **Series review** | Phase 1 | Rate/review the show as a whole (existing First Take on the show) |
| **Episode rankings** | Phase 5 | Community-voted best episodes per series |
| **Spoiler gating** | All phases | Reviews hidden for episodes user hasn't watched yet |

**Key insight from research**: Serializd and TV Time prove that episode-level spoiler gating is non-negotiable for TV reviews. CineTrak already tracks watched episodes — we just need to gate review visibility against that progress.

---

## 7. Edge Cases & Moderation

| Scenario | Handling |
|----------|----------|
| User edits review after getting likes | Allowed. Edited reviews show "(edited)" indicator. No like reset. |
| User deletes review with comments | Comments deleted too (cascade). |
| Spoiler in comment | Reporter flags it. Auto-hidden after 3 reports. Manual review within 24h. |
| Review bombing (coordinated low ratings) | Rate limit: max 20 reviews/day per user. Anomaly detection on movies with sudden rating spikes. |
| Empty review (rating only, no text) | Allowed and encouraged. Shows as star rating on movie page. Not shown in text review feeds. |
| Blocked user's reviews | Hidden from blocker's feed and movie detail page. |
| Private review | Only visible to the author. Not counted in community averages. |

---

## 8. Estimated Timeline

| Phase | Effort | Earliest Start | Dependency |
|-------|--------|----------------|------------|
| Phase 1: Enhanced Reviews | 1-2 weeks | ~~Immediately~~ ✅ COMPLETE | None |
| Phase 1.5: Profile Reviews & Review Detail | 1-2 weeks | Immediately | Phase 1 complete |
| Phase 2: Social Engagement | 2-3 weeks | After Phase 1.5 gates met | Phase 1.5 gates |
| Phase 3: Conversation | 2-3 weeks | After Phase 2 gates met | Phase 2 gates |
| Phase 4: Profile & Taste | 2-3 weeks | After Phase 3 gates met | Phase 3 gates |
| Phase 5: Discovery & Growth | 3-4 weeks | After Phase 4 gates met | Phase 4 gates |

**Total**: ~12-16 weeks if all gates pass. Could be longer if early phases don't hit targets (which is the point — we don't overbuild).

---

## 9. Success Metrics (Overall)

### Engineering Quality (What we control)
| Metric | Target | When |
|--------|--------|------|
| Edge function uptime | 99.9%+ | All phases |
| API response time (p95) | < 500ms | All phases |
| Data integrity violations | 0 (denormalized counts always match) | All phases |
| Spoiler leaks | 0 incidents of unintended spoiler exposure | All phases |
| RLS bypass incidents | 0 unauthorized data access | All phases |
| Unit test coverage on review logic | > 80% | All phases |
| E2E test coverage for review flows | All happy paths + critical error paths | All phases |

### Business Milestones (What we track but don't gate on)
| Metric | Aspirational Target | Timeframe |
|--------|---------------------|-----------|
| Total reviews | 10,000+ | 6 months after Phase 1 |
| Monthly active reviewers | 500+ | 6 months |
| Reviews driving signups (via shares) | 100+/month | After Phase 3 |
| Premium conversions from stats | 5%+ of viewers | After Phase 4 |

*These business metrics are tracked for insight, not used as phase gates. We ship quality code regardless of adoption pace.*

---

## 10. Open Questions

| # | Question | Impact | Recommendation |
|---|----------|--------|----------------|
| 1 | Should we rebrand "First Takes" → "Reviews"? | Naming consistency | Yes — Phase 1. "First Take" implies first viewing only; "Review" is universal |
| 2 | Should rating scale change from 1-10 to 1-5 stars (half-star increments)? | Alignment with Letterboxd/industry standard | Keep 1-10 for now — it's our differentiator. More granularity = more interesting stats |
| 3 | Should private reviews count toward community averages? | Data quality | No — only public reviews contribute to averages |
| 4 | Max review length — 500 or 2000 chars? | Storage + UI | **Decided: 2000 chars** for full reviews (separate `reviews` table). First Takes remain 500 chars. Profile cards truncate at 100 chars with tap-to-expand. |
| 5 | Should we allow reviews on movies the user hasn't marked as watched? | Data integrity | No — you must have the movie in your journal to review it. Prevents drive-by review bombing |

---

## 11. Related PRDs

- `docs/PRD-social-feed-tab.md` — Activity feed extraction to dedicated tab
- `docs/done/PRD-first-takes.md` — Current First Takes implementation
- `docs/done/PRD-tv-shows.md` — TV show tracking infrastructure
- `docs/PRD-premium-gating.md` — Premium subscription infrastructure (needed for Phase 4 stats)
- `docs/PRD-push-notifications.md` — Push notifications (needed for Phase 2 notifications)

---

## Reviews Polish: Bugs & Improvements (Post-Phase 3)

Tracked issues discovered during Phase 3 QA. Address before proceeding to Phase 4.

### Bugs

| # | Area | Issue | Severity | Status |
|---|------|-------|----------|--------|
| B1 | Feed filters | "Reviews" pill filter shows no visible change — likely because no reviews exist yet (only first takes). Verify behavior once reviews are submitted; may need to show an empty state or include first takes in the "Reviews" filter | Medium | Open |
| B2 | Review detail | Spoiler review page looks ugly — redundant "contains spoilers" messaging. The spoiler banner + spoiler overlay + spoiler pill all show simultaneously, feels repetitive | Medium | Open |

### UI Improvements

| # | Area | Issue | Priority | Status |
|---|------|-------|----------|--------|
| U1 | Feed filters | Spacing too tight between filter pill row and first feed item below Activity section header | High | Open |
| U2 | Profile > Reviews tab | Filter pill boxes look bad — need redesigned filtering UX for this tab | High | Open |
| U3 | Review detail | Like button feels isolated/lonely at the bottom of the review page. Consider adding engagement context (comment count, share button inline, etc.) | Low | Open |

### Features to Test

Items that need hands-on QA before considering Phase 3 complete:

- [ ] **Comments**: Write a comment on a review, test threading (reply to comment), test spoiler toggle on comments, test long-press actions (delete own, report others)
- [ ] **Share button**: Tap share on a public review — verify native share sheet opens with review card image (iOS), verify web clipboard/navigator.share fallback
- [ ] **OG meta previews**: Share a review URL on social media or paste into [opengraph.xyz](https://opengraph.xyz) — verify rich preview renders with poster, title, description
- [ ] **Comment notifications**: Comment on someone's review → verify they receive a notification; reply to a comment → verify parent commenter gets notified
- [ ] **Feed comment activity**: After commenting, verify "X commented on Y's review" appears in followers' feeds
- [ ] **Like notifications**: Like a review → verify author receives notification
- [ ] **Moderation**: Report a comment → verify it works; report same comment 3x from different accounts → verify auto-hide

---

*This PRD follows CineTrak's phase-gated approach: build only what's validated, measure before scaling, and never overbuild ahead of user demand.*
