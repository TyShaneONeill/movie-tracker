# PRD: Social Features 2.0 — Follow System & User Discovery

## Overview
Add social connectivity to CineTrak: follow other users, discover movie lovers, and get notified when people engage with your content. This is the foundation for building a community around movie tracking.

## Vision
> "Share your movie journey with people who get it."

CineTrak isn't just about tracking movies — it's about connecting with others who share your taste. Find friends, follow film critics, and see what the community is watching.

---

## Why This Matters

### User Retention
- Social connections = stickier app
- "What are my friends watching?" is a daily use case
- Notifications bring users back

### Growth & Virality
- Users invite friends to follow them
- Public profiles = discoverability
- "Follow me on CineTrak" in bios

### Competitive Parity
- Letterboxd has follows + activity
- Users expect social features in 2024+
- Table stakes for movie apps

---

## Scope: What's IN for 2.0

| Feature | Included |
|---------|----------|
| Follow/unfollow users | ✅ |
| Followers/following counts | ✅ |
| Followers/following lists | ✅ |
| User search | ✅ |
| View others' profiles (limited) | ✅ |
| In-app notifications | ✅ |
| Notification inbox | ✅ |

## Scope: What's OUT (Deferred)

| Feature | Reason |
|---------|--------|
| Friends-first activity feed | Complex logic, needs more design |
| Watchlist social (likes/comments) | Scope creep |
| Suggested users | Nice-to-have |
| Mutual followers | Nice-to-have |
| Push notifications | Requires additional infrastructure |
| Public/private profiles | Privacy controls deferred |
| Block users | Privacy controls deferred |

---

## User Experience

### 1. Following Someone

```
┌─────────────────────────────────────────────────────────────┐
│  DISCOVERY → FOLLOW FLOW                                    │
│                                                             │
│  User searches "filmfan123"                                 │
│                    ↓                                        │
│  ┌─────────────────────────────────────┐                   │
│  │ 🔍 Search                           │                   │
│  │ ┌─────┬─────┬─────┬─────┐          │                   │
│  │ │Movie│Shows│People│Users│ ← NEW    │                   │
│  │ └─────┴─────┴─────┴─────┘          │                   │
│  │                                     │                   │
│  │  👤 filmfan123                      │                   │
│  │     @filmfan123 · 142 movies       │                   │
│  │                        [Follow]     │                   │
│  │                                     │                   │
│  │  👤 filmfanatic                     │                   │
│  │     @filmfanatic · 89 movies       │                   │
│  │                        [Follow]     │                   │
│  └─────────────────────────────────────┘                   │
│                    ↓                                        │
│  User taps "Follow"                                         │
│                    ↓                                        │
│  Button changes to [Following ✓]                           │
│  Haptic feedback                                            │
│  filmfan123 receives notification                           │
└─────────────────────────────────────────────────────────────┘
```

### 2. Viewing Someone's Profile

```
┌─────────────────────────────────────────────────────────────┐
│  OTHER USER'S PROFILE (Limited View)                        │
│                                                             │
│  ┌─────────────────────────────────────┐                   │
│  │        [Avatar]                     │                   │
│  │       filmfan123                    │                   │
│  │      @filmfan123                    │                   │
│  │                                     │                   │
│  │   142 movies · 12 First Takes       │                   │
│  │                                     │                   │
│  │  23 Followers    45 Following       │                   │
│  │                                     │                   │
│  │         [Following ✓]               │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  ┌──────────────────────────────────────┐                  │
│  │ Collection │ First Takes │ Watchlist │ ← Tabs           │
│  └──────────────────────────────────────┘                  │
│                                                             │
│  COLLECTION TAB:                                            │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                          │
│  │     │ │     │ │     │ │     │  ← Posters only          │
│  │ 🎬  │ │ 🎬  │ │ 🎬  │ │ 🎬  │    NOT tappable          │
│  │     │ │     │ │     │ │     │    (no journey access)   │
│  └─────┘ └─────┘ └─────┘ └─────┘                          │
│                                                             │
│  FIRST TAKES TAB:                                           │
│  Shows their First Takes (viewable, not editable)          │
│                                                             │
│  WATCHLIST TAB:                                             │
│  Shows their watchlist (read-only)                          │
│                                                             │
│  ❌ NO Stats tab (private)                                  │
│  ❌ NO Journeys access (private - theater safety)           │
└─────────────────────────────────────────────────────────────┘
```

### 3. Notification Inbox

```
┌─────────────────────────────────────────────────────────────┐
│  PROFILE SCREEN                                             │
│  ┌─────────────────────────────────────┐                   │
│  │  [Settings]        [📬 2]  ← Mail   │                   │
│  │                      ↑              │                   │
│  │               Unread badge          │                   │
│  └─────────────────────────────────────┘                   │
│                    ↓                                        │
│  User taps mail icon                                        │
│                    ↓                                        │
│  ┌─────────────────────────────────────┐                   │
│  │           Notifications             │                   │
│  │                                     │                   │
│  │  ● filmfan123 followed you          │ ← Unread (dot)   │
│  │    2 minutes ago                    │                   │
│  │                                     │                   │
│  │  ● movielover liked your           │                   │
│  │    First Take on "Dune"            │                   │
│  │    15 minutes ago                   │                   │
│  │                                     │                   │
│  │  ○ cinephile followed you           │ ← Read           │
│  │    Yesterday                        │                   │
│  │                                     │                   │
│  └─────────────────────────────────────┘                   │
│                                                             │
│  Tap notification → Navigate to relevant screen            │
│  (profile for follow, First Take for like)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Database Schema (Supabase)

#### New Table: `follows`
```sql
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)  -- Can't follow yourself
);

-- Indexes for fast lookups
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- RLS Policies
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Anyone can see follows (public social graph)
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT
  TO authenticated
  USING (true);

-- Users can only create their own follows
CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);
```

#### New Table: `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'follow', 'like_first_take', etc.
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- Who triggered it
  data JSONB DEFAULT '{}',  -- Additional context (first_take_id, movie_title, etc.)
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user notification fetches
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Only system/triggers create notifications (use service role)
-- No INSERT policy for regular users
```

#### Update Table: `profiles`
```sql
-- Add follower/following counts (denormalized for performance)
ALTER TABLE profiles
  ADD COLUMN followers_count INTEGER DEFAULT 0,
  ADD COLUMN following_count INTEGER DEFAULT 0;

-- Trigger to update counts on follow/unfollow
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET followers_count = followers_count - 1 WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = following_count - 1 WHERE id = OLD.follower_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_change
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_counts();
```

#### Trigger: Create Notification on Follow
```sql
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, data)
  VALUES (
    NEW.following_id,  -- Notify the person being followed
    'follow',
    NEW.follower_id,   -- Who followed them
    '{}'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_new_follow
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_follow_notification();
```

### File Structure

```
app/
├── user/
│   └── [id].tsx                    # Other user's profile (NEW)
├── notifications.tsx               # Notification inbox (NEW)
├── followers/
│   └── [id].tsx                    # Followers list (NEW)
├── following/
│   └── [id].tsx                    # Following list (NEW)

components/
├── social/
│   ├── FollowButton.tsx            # Follow/Following button (NEW)
│   ├── UserSearchResult.tsx        # User in search results (NEW)
│   ├── NotificationItem.tsx        # Single notification row (NEW)
│   └── UserProfileHeader.tsx       # Reusable profile header (NEW)

hooks/
├── use-follow.ts                   # Follow/unfollow logic (NEW)
├── use-followers.ts                # Fetch followers list (NEW)
├── use-following.ts                # Fetch following list (NEW)
├── use-notifications.ts            # Fetch notifications (NEW)
├── use-user-profile.ts             # Fetch other user's profile (NEW)
├── use-user-search.ts              # Search for users (NEW)

lib/
├── follow-service.ts               # Follow API calls (NEW)
├── notification-service.ts         # Notification API calls (NEW)
```

### API Calls

```typescript
// lib/follow-service.ts

export async function followUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: currentUserId, following_id: userId });
  if (error) throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .match({ follower_id: currentUserId, following_id: userId });
  if (error) throw error;
}

export async function isFollowing(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('follows')
    .select('id')
    .match({ follower_id: currentUserId, following_id: userId })
    .single();
  return !!data;
}

export async function getFollowers(userId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('follows')
    .select('follower:profiles!follower_id(*)')
    .eq('following_id', userId);
  return data?.map(d => d.follower) || [];
}

export async function getFollowing(userId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('follows')
    .select('following:profiles!following_id(*)')
    .eq('follower_id', userId);
  return data?.map(d => d.following) || [];
}
```

---

## Implementation Phases

### Phase 1: Database & Follow System
**Goal:** Follow/unfollow works, counts update

- [ ] Create `follows` table with RLS
- [ ] Add `followers_count` / `following_count` to profiles
- [ ] Create count update trigger
- [ ] Create `lib/follow-service.ts`
- [ ] Create `hooks/use-follow.ts`
- [ ] Create `FollowButton` component
- [ ] Add follow button to existing cast/person pages if applicable

**Testing:** Follow a user → counts update → unfollow → counts decrement

### Phase 2: User Search
**Goal:** Find users in search

- [ ] Create `hooks/use-user-search.ts`
- [ ] Create `UserSearchResult` component
- [ ] Add "Users" tab to Search screen
- [ ] Show avatar, username, movie count, follow button in results

**Testing:** Search "test" → see user results → tap follow → button updates

### Phase 3: Other User's Profile
**Goal:** View someone else's profile

- [ ] Create `app/user/[id].tsx`
- [ ] Create `hooks/use-user-profile.ts`
- [ ] Reuse collection grid (disable tap navigation)
- [ ] Reuse First Takes list (read-only)
- [ ] Reuse watchlist view (read-only)
- [ ] Hide stats tab
- [ ] Add follow button to header

**Testing:** Tap user in search → see their profile → see collection (no tap) → see watchlist

### Phase 4: Followers/Following Lists
**Goal:** See who follows you and who you follow

- [ ] Create `app/followers/[id].tsx`
- [ ] Create `app/following/[id].tsx`
- [ ] Create `hooks/use-followers.ts`
- [ ] Create `hooks/use-following.ts`
- [ ] Make follower/following counts tappable on profile
- [ ] Show list with avatar, name, follow button

**Testing:** Tap "23 Followers" → see list → tap user → go to their profile

### Phase 5: Notifications
**Goal:** Get notified when someone follows you or likes your First Take

- [ ] Create `notifications` table with RLS
- [ ] Create follow notification trigger
- [ ] Create like notification trigger (for First Takes)
- [ ] Create `lib/notification-service.ts`
- [ ] Create `hooks/use-notifications.ts`
- [ ] Create `app/notifications.tsx`
- [ ] Create `NotificationItem` component
- [ ] Add mail icon to Profile screen header
- [ ] Show unread count badge
- [ ] Mark as read on view

**Testing:** Someone follows you → notification appears → tap → go to their profile

---

## UI Specifications

### Follow Button States

```
┌─────────────────┐
│    [Follow]     │  ← Default (not following)
│    Primary      │     Background: rose-600
└─────────────────┘

┌─────────────────┐
│  [Following ✓]  │  ← Following
│    Secondary    │     Background: transparent
│                 │     Border: zinc-600
└─────────────────┘

┌─────────────────┐
│   [Unfollow]    │  ← On hover/long-press of Following
│    Danger       │     Background: red
└─────────────────┘
```

### User Search Result Card

```
┌────────────────────────────────────────────────┐
│ [Avatar]  Display Name                [Follow] │
│           @username · 142 movies               │
└────────────────────────────────────────────────┘
```

### Notification Item

```
┌────────────────────────────────────────────────┐
│ ●  [Avatar]  filmfan123 followed you           │
│              2 minutes ago                     │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ ●  [Avatar]  movielover liked your First Take  │
│    [Poster]  on "Dune: Part Two"              │
│              15 minutes ago                    │
└────────────────────────────────────────────────┘
```

### Unread Badge

```
Mail icon with badge:
  📬        Normal (no unread)
  📬 [3]    3 unread (red badge)
```

---

## Privacy Considerations

### What's Public (Viewable by Others)
- Profile photo
- Display name & username
- Follower/following counts
- Collection (posters only, no journey details)
- First Takes
- Watchlist

### What's Private (Only You)
- Stats (total watched, hours, etc.)
- Journeys (theater locations, dates, who you went with)
- Notification inbox (your notifications only)

### Future Privacy Features (2.1+)
- Public/private profile toggle
- Hide watchlist from others
- Block users
- Approve follow requests (if private)

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Follow yourself | Prevented at DB level (CHECK constraint) |
| View deleted user's profile | Show "User not found" |
| Notification for deleted user | actor_id is NULL, show "Someone followed you" |
| Unfollow from notification | Can tap notification → go to profile → unfollow |
| Very long username | Truncate with ellipsis |
| User has no movies | Show "No movies yet" in collection |

---

## Success Metrics

### Engagement
- % of users who follow at least 1 person (target: 30%+)
- Average follows per user
- Notification open rate

### Retention
- Do users with followers return more often?
- Correlation between follow count and retention

### Growth
- Users acquired via "follow me" shares
- Profile views per user

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Public or private by default? | Public (like Letterboxd) |
| Can you see others' journeys? | No (theater safety concern) |
| Can you see others' stats? | No (keep private for now) |
| Where do notifications live? | Mail icon on Profile screen |
| Activity feed changes? | None for 2.0 (defer friends-first feed) |

---

## Future Enhancements (Backlog)

1. **Friends-First Activity Feed** — Show friends' activity first, then global when "caught up"
2. **Watchlist Social** — Like, comment, share watchlists
3. **Suggested Users** — "Popular on CineTrak", "Similar taste to you"
4. **Mutual Followers** — "Followed by 3 people you follow"
5. **Push Notifications** — Real-time alerts
6. **Privacy Controls** — Public/private toggle, block users
7. **Activity Status** — "Currently watching", "Recently active"

---

## References

- [Letterboxd social features](https://letterboxd.com/)
- [Supabase RLS documentation](https://supabase.com/docs/guides/auth/row-level-security)
