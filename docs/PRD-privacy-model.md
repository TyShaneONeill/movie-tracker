# PRD: Privacy & Visibility Model

**Author:** Ty
**Date:** 2026-03-08
**Status:** Draft
**Priority:** Critical

---

## 1. Problem Statement

Cinetrak's social features have grown organically, resulting in an inconsistent privacy model:

- **First Takes** have per-item visibility (`public`/`followers_only`/`private`) with a working RLS policy
- **Reviews** have a visibility column but **no RLS policy** — all reviews are readable by anyone
- **Collections** (watched movies) have **no privacy controls at all** — fully public
- **Watchlists** have **no privacy controls** — fully public
- **Lists** have a binary `is_public` flag but **no RLS policy**
- **Profiles** have no concept of public vs private accounts
- The settings page has a "Privacy" row stubbed as **"Coming Soon"**

Users cannot control who sees their profile content at a high level, and per-item visibility is only partially enforced.

---

## 2. Goals

1. **Profile-level privacy** — Users can set their account to `public` or `private`
2. **Per-content visibility** — First takes, reviews, and lists keep granular `public`/`followers_only`/`private` controls
3. **Privacy ceiling rule** — Profile privacy caps content visibility (private profile + public post = followers only)
4. **Database enforcement** — All visibility rules enforced via RLS policies, not just app code
5. **Consistent UX** — Privacy indicators and controls are uniform across all content types
6. **Follow requests for private accounts** — Private profiles require approval before granting follower access

---

## 3. Privacy Model

### 3.1 Profile-Level Privacy

| Setting | Who can see profile content | Who can follow |
|---------|---------------------------|----------------|
| **Public** | Everyone | Anyone (instant) |
| **Private** | Only approved followers + self | Requires approval (follow request) |

**New column:** `profiles.is_private` (boolean, default `false`)

### 3.2 Effective Visibility Rule

The **more restrictive** setting always wins:

```
effective_visibility = MOST_RESTRICTIVE(profile_privacy, content_visibility)
```

| Profile | Content Setting | Effective Visibility |
|---------|----------------|---------------------|
| Public  | public         | **Everyone** |
| Public  | followers_only | **Followers only** |
| Public  | private        | **Only me** |
| Private | public         | **Followers only** (profile caps it) |
| Private | followers_only | **Followers only** |
| Private | private        | **Only me** |

### 3.3 Content Visibility by Type

| Content Type | Has Per-Item Visibility | Default | Notes |
|-------------|------------------------|---------|-------|
| First Takes | Yes (`public`/`followers_only`/`private`) | User's default pref | Already has column + UI picker |
| Reviews | Yes (`public`/`followers_only`/`private`) | User's default pref | Already has column + UI picker |
| Lists | Yes — upgrade from boolean to enum | `public` | Currently `is_public` boolean, migrate to `visibility` enum |
| Collection (watched) | No — inherits profile privacy | Profile setting | Public profiles = everyone sees it; private = followers only |
| Watchlist | No — inherits profile privacy | Profile setting | Same as collection |
| Achievements | Always public | N/A | Not sensitive, good for discovery |

### 3.4 Follow Requests (Private Accounts)

When a profile is **private**:

1. User taps "Follow" → creates a **follow request** (pending state)
2. Profile owner sees request in notifications
3. Owner can **accept** (creates follow) or **decline** (deletes request)
4. Requester sees "Requested" button state until resolved

**New table:** `follow_requests`
```sql
CREATE TABLE follow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  target_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, target_id)
);
```

**Existing followers are grandfathered** — when a user switches to private, current followers remain.

---

## 4. Current State vs Target State

### 4.1 What Already Works

| Feature | Status | Location |
|---------|--------|----------|
| First Takes visibility column | Done | `first_takes.visibility` |
| First Takes RLS policy | Done | Migration `20260214300000` |
| First Takes visibility picker UI | Done | `components/first-take-modal.tsx` |
| Reviews visibility column | Done | `reviews.visibility` |
| Reviews visibility picker UI | Done | `components/review-modal.tsx` |
| Review card visibility icons | Done | `components/cards/review-card.tsx` (globe/people/lock) |
| Default visibility preference | Done | `profiles.review_visibility` + settings toggle |
| Lists `is_public` column | Done | `user_lists.is_public` |
| Lists privacy toggle UI | Done | `components/modals/create-list-modal.tsx` |
| Feed visibility filtering | Done | `lib/feed-service.ts` filters by visibility |
| Follow/unfollow system | Done | `lib/follow-service.ts` |
| FollowButton component | Done | `components/social/FollowButton.tsx` |

### 4.2 What's Broken

| Issue | Severity | Detail |
|-------|----------|--------|
| Other-user first takes not filtered | **Critical** | `hooks/use-user-profile.ts:79-87` fetches ALL first takes, ignores visibility. RLS should catch this but query casts away types with `as any` |
| Reviews have no RLS policy | **Critical** | `reviews` table has visibility column but no database policy enforcing it |
| Lists have no RLS policy | **High** | `user_lists` table has `is_public` but no RLS |
| user_movies has no RLS | **High** | Collections/watchlists readable by anyone, no privacy |
| Settings "Privacy" is stubbed | **Medium** | Shows "Coming Soon" — no way to set profile privacy |

### 4.3 What Needs to Be Built

| Feature | Effort | Detail |
|---------|--------|--------|
| `profiles.is_private` column | Small | Migration to add boolean column |
| `follow_requests` table | Small | New table + RLS policies |
| Profile privacy RLS policies | Medium | Policies on `user_movies`, `reviews`, `user_lists` that check profile privacy + follow status |
| Privacy settings UI | Medium | Toggle in settings page, replace "Coming Soon" |
| Follow request flow | Medium | Request/accept/decline UI + notification type |
| FollowButton updates | Small | "Requested" state for pending requests |
| Other-user profile gating | Medium | Show locked state for private profiles when not following |
| Lists visibility migration | Small | Migrate `is_public` boolean → `visibility` enum |
| Notification for follow requests | Small | New notification type in existing notification system |

---

## 5. Implementation Plan

### Phase 1: Fix Critical Bugs (No UI changes)

**Goal:** Enforce existing visibility settings correctly.

#### 1A. Add RLS policy on `reviews` table
```sql
CREATE POLICY "Reviews visible based on privacy setting"
  ON public.reviews FOR SELECT TO public
  USING (
    visibility = 'public'
    OR user_id = (SELECT auth.uid())
    OR (
      visibility = 'followers_only'
      AND EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = (SELECT auth.uid())
        AND following_id = reviews.user_id
      )
    )
  );
```

#### 1B. Add RLS policy on `user_lists` table
```sql
CREATE POLICY "Lists visible based on privacy setting"
  ON public.user_lists FOR SELECT TO public
  USING (
    is_public = true
    OR user_id = (SELECT auth.uid())
  );
```

#### 1C. Fix `fetchOtherUserFirstTakes` query
Remove the `as any` cast and ensure the query doesn't bypass RLS. The RLS policy already exists — the issue is the `as any` cast may be masking a type error that causes the query to run without auth context.

**Files:** `hooks/use-user-profile.ts`

#### 1D. Add RLS policy on `user_movies` for authenticated reads
```sql
-- For now, keep user_movies publicly readable (no profile privacy yet)
-- This will be updated in Phase 2 when profile privacy is added
CREATE POLICY "User movies are publicly readable"
  ON public.user_movies FOR SELECT TO public
  USING (true);
```

---

### Phase 2: Profile Privacy Infrastructure

**Goal:** Add profile-level privacy with the ceiling rule.

#### 2A. Database migration
```sql
-- Add is_private to profiles
ALTER TABLE profiles ADD COLUMN is_private boolean NOT NULL DEFAULT false;

-- Create follow_requests table
CREATE TABLE public.follow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, target_id)
);

ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

-- RLS: users can see their own requests (sent or received)
CREATE POLICY "Users can view their own follow requests"
  ON public.follow_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());

-- RLS: authenticated users can create requests
CREATE POLICY "Users can create follow requests"
  ON public.follow_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- RLS: target user or requester can delete (decline/cancel)
CREATE POLICY "Users can delete their own follow requests"
  ON public.follow_requests FOR DELETE TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());
```

#### 2B. Update RLS policies with profile privacy ceiling

**Helper function** (reusable across policies):
```sql
CREATE OR REPLACE FUNCTION public.can_view_user_content(
  content_user_id uuid,
  content_visibility text DEFAULT 'public'
) RETURNS boolean AS $$
DECLARE
  profile_private boolean;
  viewer_id uuid;
  is_follower boolean;
BEGIN
  viewer_id := auth.uid();

  -- Owner always sees own content
  IF viewer_id = content_user_id THEN RETURN true; END IF;

  -- Check if profile is private
  SELECT is_private INTO profile_private FROM profiles WHERE id = content_user_id;

  -- Private content is always owner-only
  IF content_visibility = 'private' THEN RETURN false; END IF;

  -- Check follow relationship
  SELECT EXISTS(
    SELECT 1 FROM follows WHERE follower_id = viewer_id AND following_id = content_user_id
  ) INTO is_follower;

  -- Private profile: must be follower regardless of content visibility
  IF profile_private THEN RETURN is_follower; END IF;

  -- Public profile: respect content visibility
  IF content_visibility = 'public' THEN RETURN true; END IF;
  IF content_visibility = 'followers_only' THEN RETURN is_follower; END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

**Updated policies:**
```sql
-- First Takes (replace existing policy)
DROP POLICY "First takes visible based on privacy setting" ON public.first_takes;
CREATE POLICY "First takes visible with profile privacy"
  ON public.first_takes FOR SELECT TO public
  USING (can_view_user_content(user_id, visibility));

-- Reviews (replace Phase 1 policy)
DROP POLICY "Reviews visible based on privacy setting" ON public.reviews;
CREATE POLICY "Reviews visible with profile privacy"
  ON public.reviews FOR SELECT TO public
  USING (can_view_user_content(user_id, visibility));

-- User Movies (replace Phase 1 policy)
DROP POLICY "User movies are publicly readable" ON public.user_movies;
CREATE POLICY "User movies visible with profile privacy"
  ON public.user_movies FOR SELECT TO public
  USING (can_view_user_content(user_id, 'public'));

-- User Lists (replace Phase 1 policy)
DROP POLICY "Lists visible based on privacy setting" ON public.user_lists;
CREATE POLICY "Lists visible with profile privacy"
  ON public.user_lists FOR SELECT TO public
  USING (
    can_view_user_content(user_id, CASE WHEN is_public THEN 'public' ELSE 'private' END)
  );
```

#### 2C. Follow request service
**New file:** `lib/follow-request-service.ts`
- `sendFollowRequest(requesterId, targetId)` — insert into follow_requests
- `acceptFollowRequest(requestId)` — delete request + insert into follows
- `declineFollowRequest(requestId)` — delete request
- `cancelFollowRequest(requesterId, targetId)` — requester cancels
- `getPendingRequests(userId)` — requests where target_id = userId
- `getRequestStatus(requesterId, targetId)` — check if pending request exists

#### 2D. Update follow service
Modify `followUser()` to check if target is private:
- If target is public → direct follow (existing behavior)
- If target is private → create follow request instead

#### 2E. Update FollowButton component
New states:
- **"Follow"** — default, public profile
- **"Requested"** — pending follow request on private profile (outline style, clock icon)
- **"Following"** — approved follower
- **"Unfollow"** — long-press/tap on "Following"

---

### Phase 3: Settings & Profile UI

**Goal:** Let users control privacy and see locked profiles.

#### 3A. Privacy settings in settings page
Replace the "Coming Soon" privacy row with a working toggle:
- **"Private Account"** toggle (on/off)
- Description: "When your account is private, only people you approve can see your collection, first takes, and reviews"
- When toggling ON: show confirmation alert ("Existing followers will remain")
- When toggling OFF: show confirmation alert ("Your profile will be visible to everyone. Pending follow requests will be auto-accepted.")

**File:** `app/settings/index.tsx` — replace lines 228-234

#### 3B. Other-user profile locked state
When visiting a **private profile you don't follow**:
- Show: avatar, name, username, bio, follower/following counts
- Show: "This account is private" message with lock icon
- Show: "Follow" button (sends request)
- **Hide:** All tabs (collection, first takes, watchlist)

When visiting a **private profile you DO follow**:
- Show everything normally (same as public profile)

**File:** `app/user/[id].tsx` — add privacy gate around tab content

#### 3C. Follow request notifications
Add new notification type: `follow_request`
- Shows in notification list: "[User] wants to follow you"
- Accept/Decline buttons inline
- On accept: follow is created, notification marked as handled
- On decline: request deleted, notification marked as handled

**File:** `hooks/use-notifications.ts`, notification rendering components

#### 3D. Auto-accept on switching to public
When user switches from private → public:
- All pending follow_requests are auto-accepted (batch insert into follows + delete requests)
- Edge function or database trigger handles this

---

### Phase 4: Lists Visibility Upgrade (Optional Enhancement)

**Goal:** Align lists with the same 3-tier visibility as reviews.

#### 4A. Migrate `is_public` → `visibility`
```sql
ALTER TABLE user_lists ADD COLUMN visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'followers_only', 'private'));

-- Migrate existing data
UPDATE user_lists SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END;

-- Drop old column (after app code is updated)
ALTER TABLE user_lists DROP COLUMN is_public;
```

#### 4B. Update create-list modal
Replace binary lock toggle with 3-option pill selector (matching first-take/review modals).

#### 4C. Update RLS policy
```sql
CREATE POLICY "Lists visible with profile privacy"
  ON public.user_lists FOR SELECT TO public
  USING (can_view_user_content(user_id, visibility));
```

---

## 6. Migration Safety

### Order of operations (critical):
1. **Phase 1 first** — fix existing bugs with no UI changes, no breaking changes
2. **Phase 2 DB changes** — add columns/tables, deploy new RLS function, update policies
3. **Phase 2 app changes** — deploy follow request flow, updated follow logic
4. **Phase 3 UI** — settings toggle, locked profile state, notifications
5. **Phase 4** — lists upgrade (can be deferred)

### Backwards compatibility:
- `is_private` defaults to `false` — all existing profiles remain public
- Existing followers are preserved when switching to private
- `can_view_user_content()` returns `true` for public profiles + public content (no behavior change for existing users)
- Feed service already filters by visibility — no changes needed there

### Performance considerations:
- `can_view_user_content()` is marked `STABLE` for query planner optimization
- The function executes at most 2 queries (profile lookup + follow check)
- Add index: `CREATE INDEX idx_follows_follower_following ON follows(follower_id, following_id);` (if not exists)
- Add index: `CREATE INDEX idx_profiles_is_private ON profiles(is_private) WHERE is_private = true;`

---

## 7. Edge Cases

| Scenario | Behavior |
|----------|----------|
| User switches public → private | Existing followers stay. New follows require approval. |
| User switches private → public | All pending follow requests auto-accepted. All content becomes visible per its own setting. |
| Private user's "public" first take | Visible to followers only (profile caps it). |
| User blocks someone (future) | Out of scope for this PRD. |
| Guest/unauthenticated user | Can see public profiles' public content. Cannot see any private profile content. Cannot follow. |
| User views own profile | Always sees everything regardless of privacy settings. |
| Private profile in activity feed | `followers_only` and `public` posts appear only in followers' feeds. Community feed excludes private profiles entirely. |
| Search results | Private profiles appear in search but show lock icon. Tapping shows locked profile state. |
| Followers/following counts on private profile | Always visible (same as Instagram). |

---

## 8. Files to Modify

### Phase 1 (Bug Fixes)
| File | Change |
|------|--------|
| `supabase/migrations/NEW_phase1.sql` | RLS policies for reviews, user_lists, user_movies |
| `hooks/use-user-profile.ts` | Remove `as any` cast on first_takes query |

### Phase 2 (Infrastructure)
| File | Change |
|------|--------|
| `supabase/migrations/NEW_phase2.sql` | `is_private` column, `follow_requests` table, `can_view_user_content()` function, updated RLS policies |
| `lib/database.types.ts` | Add follow_requests types, update profiles type with `is_private` |
| `lib/follow-request-service.ts` | **New** — CRUD for follow requests |
| `lib/follow-service.ts` | Check `is_private` before direct follow |
| `hooks/use-follow.ts` | Add request state, pending check |
| `hooks/use-follow-requests.ts` | **New** — hook for managing requests |

### Phase 3 (UI)
| File | Change |
|------|--------|
| `app/settings/index.tsx` | Replace "Coming Soon" with working privacy toggle |
| `app/user/[id].tsx` | Add locked profile state for private accounts |
| `components/social/FollowButton.tsx` | Add "Requested" state |
| `hooks/use-notifications.ts` | Add `follow_request` notification type |
| Notification components | Accept/decline UI for follow requests |

### Phase 4 (Lists Upgrade)
| File | Change |
|------|--------|
| `supabase/migrations/NEW_phase4.sql` | Migrate `is_public` → `visibility` |
| `lib/database.types.ts` | Update user_lists type |
| `components/modals/create-list-modal.tsx` | 3-option visibility picker |
| `lib/list-service.ts` | Update queries for new column |

---

## 9. Testing Checklist

### Phase 1
- [ ] Private first take not visible to non-followers on profile page
- [ ] Followers-only first take visible to followers, hidden from non-followers
- [ ] Private review not visible to non-followers
- [ ] Private list not visible to non-owners
- [ ] Guest users can still browse public content
- [ ] Feed still correctly filters by visibility

### Phase 2
- [ ] New user defaults to public profile
- [ ] Setting profile to private prevents non-followers from seeing collection
- [ ] Setting profile to private prevents non-followers from seeing watchlist
- [ ] Private profile + public post = visible to followers only
- [ ] Private profile + private post = visible to owner only
- [ ] Follow request created when following private profile
- [ ] Follow request appears in target's notifications
- [ ] Accepting request creates follow relationship
- [ ] Declining request deletes it
- [ ] Canceling request works for requester

### Phase 3
- [ ] Privacy toggle works in settings
- [ ] Switching public → private shows confirmation
- [ ] Switching private → public auto-accepts pending requests
- [ ] Locked profile UI shows for non-followers of private accounts
- [ ] Follow button shows "Requested" state correctly
- [ ] Follow request notification shows accept/decline buttons

### Phase 4
- [ ] Lists support 3-tier visibility
- [ ] Existing lists migrated correctly (public stays public, private stays private)
- [ ] Create list modal shows visibility picker
