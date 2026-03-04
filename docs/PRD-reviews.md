# PRD: Reviews — Full Feature Suite

**Status**: Draft
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

### PHASE 1: Enhanced Reviews
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

#### 3.1 Features

**Comments on Reviews**:
- Threaded replies on any review
- Comment count displayed on review cards
- Reply notifications sent to review author + parent comment author
- Spoiler flag on individual comments
- Comment moderation: report button, auto-hide after N reports

**Review Sharing**:
- "Share" button generates a beautiful review card image (movie poster + rating + quote + username)
- Share via native share sheet (Instagram Stories, Twitter, iMessage, etc.)
- Shared card includes CineTrak branding + deep link back to review
- Web URL for each review: `cinetrak.app/review/{id}` (public reviews only)

**Enhanced Activity Feed**:
- Feed now shows: reviews, likes, comments, follows
- "X commented on Y's review of [Movie]" feed items
- Feed filters: All, Reviews Only, Friends Only
- "Caught up" indicator when you've seen all new activity

#### 3.2 Technical Scope

**New table**: `review_comments`
```sql
CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_take_id UUID NOT NULL REFERENCES first_takes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES review_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  is_spoiler BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Denormalized count
ALTER TABLE first_takes ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
```

**Edge functions**: `add-comment`, `get-comments`, `report-comment`
**New service**: `lib/share-service.ts` (generate review card image)
**New screen**: `app/review/[id].tsx` (full review + comments thread)

#### 3.3 Phase Gate — Must achieve ALL before proceeding to Phase 4

| Criteria | Requirement | Verification |
|----------|-------------|--------------|
| **Threaded comments render correctly** | Replies nest under parent comments (max 2 levels deep); thread collapse/expand works; deleted parent shows "[deleted]" with children preserved | Manual QA: create 3-level thread, delete middle comment, verify children still visible |
| **Comment count accurate** | `first_takes.comment_count` matches actual row count in `review_comments`; increments on add, decrements on delete | Automated check: add 5 comments, delete 2, verify count = 3 matches actual rows |
| **Spoiler comments gated** | Spoiler-flagged comments are blurred; revealing one doesn't reveal others; spoiler flag persists on page reload | QA: flag 2 of 5 comments as spoilers, reveal one, verify other stays blurred, reload page |
| **Report/moderation flow works** | Report button creates a moderation queue entry; auto-hides comment after 3 reports; admin can dismiss or confirm | Test full flow: report comment 3 times from different accounts → verify auto-hide → verify admin action |
| **Share card generation** | Review share card renders correctly with movie poster, rating, quote text, and CineTrak branding; works on iOS share sheet and web | Generate cards for: short review, long review (500 chars), review with special characters/emoji |
| **Deep links resolve** | `cinetrak.app/review/{id}` loads the review on web with full context; includes OG meta tags for social preview | Share a review URL on Twitter/iMessage preview → verify card renders with movie title + review snippet |
| **Review detail screen** | `app/review/[id].tsx` loads review + comments thread; handles non-existent review (404 state); handles private review (403 state) | Navigate to valid review, deleted review, and private review → verify correct states |
| **Feed integration** | Comment activity appears in followers' feeds ("X commented on Y's review"); feed doesn't duplicate entries on rapid comments | Write 3 comments quickly → verify feed shows correct entries without duplicates |
| **Cascade deletes** | Deleting a review removes all comments + notifications; deleting a comment removes child comments + notifications | Full cascade test with review that has nested comments + like notifications |
| **Rate limiting** | Comments rate limited to 30/hour per user; share card generation rate limited to 20/hour | Hit rate limit → verify 429 response with Retry-After header |
| **Dark/light mode** | Comment thread, share card, review detail screen all render correctly in both themes | Visual QA on iOS + web |
| **CI green** | All tests pass; lint + TypeScript clean | CI pipeline |

**Why these gates**: Comments and sharing are the first features that expose user content publicly outside CineTrak. Moderation, deep links, and social previews must be bulletproof — a broken share card or a spoiler leak is a trust-breaking moment.

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
| Phase 1: Enhanced Reviews | 1-2 weeks | Immediately | None |
| Phase 2: Social Engagement | 2-3 weeks | After Phase 1 gates met | Phase 1 gates |
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
| 4 | Max review length — 500 or 1000 chars? | Storage + UI | Start with 500. Increase to 1000 if Phase 1 data shows users hitting the limit frequently |
| 5 | Should we allow reviews on movies the user hasn't marked as watched? | Data integrity | No — you must have the movie in your journal to review it. Prevents drive-by review bombing |

---

## 11. Related PRDs

- `docs/PRD-social-feed-tab.md` — Activity feed extraction to dedicated tab
- `docs/done/PRD-first-takes.md` — Current First Takes implementation
- `docs/done/PRD-tv-shows.md` — TV show tracking infrastructure
- `docs/PRD-premium-gating.md` — Premium subscription infrastructure (needed for Phase 4 stats)
- `docs/PRD-push-notifications.md` — Push notifications (needed for Phase 2 notifications)

---

*This PRD follows CineTrak's phase-gated approach: build only what's validated, measure before scaling, and never overbuild ahead of user demand.*
