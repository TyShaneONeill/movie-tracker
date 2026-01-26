# PRD: First Takes Feature - Complete Specification

**Version**: 1.0
**Date**: January 24, 2026
**Status**: Draft
**Author**: Product Team

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Stories](#2-user-stories)
3. [Feature Toggle Specification](#3-feature-toggle-specification)
4. [First Take Data Model](#4-first-take-data-model)
5. [UI Components Needed](#5-ui-components-needed)
6. [Trigger Points](#6-trigger-points)
7. [API/Backend Requirements](#7-apibackend-requirements)
8. [Edge Cases](#8-edge-cases)
9. [Future Considerations](#9-future-considerations)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Overview

### 1.1 Feature Summary

**First Takes** are optional quick reviews users can submit after watching a movie - capturing their initial reaction rating and thoughts before the experience fades.

### 1.2 Core Philosophy

- **Optional by Default**: First Takes are never forced on users
- **Power User Feature**: Controlled via a settings toggle for those who want prompts
- **Immediate Capture**: Designed to capture raw, honest first impressions
- **Social (Friends Only)**: Visible to friends for authentic social sharing
- **No Time Limit**: Can be added anytime after marking a movie as watched

### 1.3 Current State Analysis

#### What Already Exists

| Component | File Path | Status |
|-----------|-----------|--------|
| Database Schema (types) | `/lib/database.types.ts` | Exists - includes `first_takes` table types |
| First Take Service | `/lib/first-take-service.ts` | Exists - CRUD operations |
| First Take Actions Hook | `/hooks/use-first-take-actions.ts` | Exists - mutation hooks |
| First Takes Query Hook | `/hooks/use-first-takes.ts` | Exists - fetch user's takes |
| First Take Modal | `/components/first-take-modal.tsx` | Exists - but uses emojis, not 1-10 rating |
| First Take Card | `/components/cards/first-take-card.tsx` | Exists - display component |
| Profile First Takes Tab | `/app/(tabs)/profile.tsx` | Exists - integrated and working |
| Movie Detail Integration | `/app/movie/[id].tsx` | Partial - prompts after watched, but no toggle check |

#### What Needs Changes

| Component | Issue | Required Change |
|-----------|-------|-----------------|
| First Take Modal | Uses emoji picker, not 1-10 rating | Complete redesign of rating UI |
| Database Schema | Has `reaction_emoji`, not numeric `rating` | Add `rating` column, deprecate emoji |
| Settings Page | No First Take toggle | Add "Prompt for First Take" toggle |
| User Preferences | No storage mechanism | Create `user_preferences` table or column |
| Movie Detail | No settings check before prompting | Check user preference before showing modal |
| Ticket Review | No First Take prompts | Add multi-movie First Take flow |
| First Take Card | Displays emoji | Display numeric rating instead |

---

## 2. User Stories

### 2.1 Core User Flows

#### US-1: First Take After Manual Watch Add (Toggle ON)
```
As a power user with First Take prompts enabled,
When I mark a movie as "Watched" from the movie detail screen,
Then I should immediately see the First Take modal to capture my reaction.
```

**Acceptance Criteria:**
- Modal appears automatically after successful status change to "watched"
- Modal should not appear if user already has a First Take for this movie
- User can skip the modal without penalty
- Successful submission saves the First Take and closes modal

#### US-2: First Take After Ticket Scan (Toggle ON)
```
As a user who just scanned a single movie ticket,
When I confirm adding it to my watched collection,
Then I should see the First Take modal for that movie.
```

**Acceptance Criteria:**
- First Take modal appears after successful "Add to Collection" action
- Only triggered if user preference is enabled
- Skip option clearly available

#### US-3: First Take After Multi-Ticket Scan (Toggle ON)
```
As a user who scanned multiple movie tickets (group outing),
When I confirm adding them to my watched collection,
Then I should see a streamlined multi-movie First Take flow.
```

**Acceptance Criteria:**
- Show a carousel/swipe interface for multiple movies
- Each movie card shows poster and rating input
- "Skip All" button available
- "Save & Next" progresses through movies
- Progress indicator shows X of Y movies
- Can save partial (some movies rated, others skipped)

#### US-4: Manual First Take from Movie Detail (Toggle OFF or ON)
```
As any user viewing a movie I've marked as watched,
When I want to add my thoughts later,
Then I should be able to access First Take from the movie detail screen.
```

**Acceptance Criteria:**
- "Add First Take" button visible on movie detail for watched movies
- Button changes to "Edit First Take" if one exists
- Works regardless of toggle setting
- Opens same First Take modal

#### US-5: Toggle First Take Prompts
```
As a user who wants to customize my experience,
When I go to Settings > App Preferences,
Then I should see a toggle for "Prompt for First Take after Watched".
```

**Acceptance Criteria:**
- Toggle is OFF by default
- Setting persists across sessions
- Changing setting takes effect immediately
- Help text explains what the setting does

#### US-6: View My First Takes
```
As a user viewing my profile,
When I tap the "First Takes" tab,
Then I should see all my First Takes in reverse chronological order.
```

**Acceptance Criteria:**
- Shows 1-10 rating prominently
- Shows movie poster, title, and my quote
- Most recent take highlighted with gold accent
- Tapping navigates to movie detail
- Spoiler content is blurred until tapped

### 2.2 Social User Flows (Future)

#### US-7: Friend Views My First Take
```
As a friend viewing another user's profile,
When I view their First Takes tab,
Then I should see their reactions with spoiler content hidden.
```

---

## 3. Feature Toggle Specification

### 3.1 Settings Integration

**Location**: Settings > App Preferences section

**UI Design**:
```
APP PREFERENCES
+--------------------------------------------------+
| Dark Mode                              [Toggle]  |
+--------------------------------------------------+
| Notifications                          [Toggle]  |
+--------------------------------------------------+
| Prompt for First Take                  [Toggle]  |
| Ask me for a quick review after I      OFF       |
| mark a movie as watched                          |
+--------------------------------------------------+
```

### 3.2 User Preference Storage

**Option A: Profile Table Extension** (Recommended)
```sql
ALTER TABLE profiles
ADD COLUMN first_take_prompt_enabled BOOLEAN DEFAULT FALSE;
```

**Option B: New Preferences Table**
```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  first_take_prompt_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Recommendation**: Option A is simpler for a single preference. If more preferences are anticipated, Option B provides better extensibility.

### 3.3 Preference Hook

**File**: `/hooks/use-user-preferences.ts`

```typescript
interface UserPreferences {
  firstTakePromptEnabled: boolean;
}

interface UseUserPreferencesResult {
  preferences: UserPreferences;
  isLoading: boolean;
  updatePreference: (key: keyof UserPreferences, value: boolean) => Promise<void>;
  isUpdating: boolean;
}

function useUserPreferences(): UseUserPreferencesResult;
```

---

## 4. First Take Data Model

### 4.1 Current Schema (in Supabase)

```sql
CREATE TABLE first_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tmdb_id INTEGER NOT NULL,
  movie_title TEXT NOT NULL,
  poster_path TEXT,
  reaction_emoji TEXT NOT NULL DEFAULT '...',  -- DEPRECATED
  quote_text TEXT NOT NULL,
  is_spoiler BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, tmdb_id)
);
```

### 4.2 Required Schema Migration

```sql
-- Add rating column (1-10 scale)
ALTER TABLE first_takes
ADD COLUMN rating SMALLINT CHECK (rating >= 1 AND rating <= 10);

-- Make rating required for new entries (after migration)
-- Note: Keep reaction_emoji for backwards compatibility, but deprecate

-- Update existing entries: convert emoji to approximate rating
-- This is a one-time migration, emojis can map to ratings:
-- Mind-blown, Fire, Loved it -> 9-10
-- Cool, Emotional -> 7-8
-- Classic -> 6-7
-- Confusing, Boring -> 3-5
-- etc.

-- Add comment explaining deprecation
COMMENT ON COLUMN first_takes.reaction_emoji IS 'DEPRECATED: Use rating column instead. Kept for backwards compatibility.';
```

### 4.3 Updated TypeScript Types

**File**: `/lib/database.types.ts`

```typescript
export interface FirstTake {
  id: string;
  user_id: string;
  tmdb_id: number;
  movie_title: string;
  poster_path: string | null;
  rating: number;           // NEW: 1-10 scale
  reaction_emoji: string;   // DEPRECATED: kept for legacy data
  quote_text: string;
  is_spoiler: boolean;
  created_at: string;
  updated_at: string;
}

export interface FirstTakeInsert {
  user_id: string;
  tmdb_id: number;
  movie_title: string;
  poster_path?: string | null;
  rating: number;           // Required for new entries
  quote_text: string;
  is_spoiler?: boolean;
}
```

### 4.4 Character Limits

Based on codebase analysis:
- **Quote Text**: 140 characters (defined in `first-take-modal.tsx` as `MAX_QUOTE_LENGTH`)
- This matches Twitter-style short-form content, encouraging concise reactions

---

## 5. UI Components Needed

### 5.1 Components to Create

| Component | File Path | Description |
|-----------|-----------|-------------|
| Rating Slider | `/components/ui/rating-slider.tsx` | 1-10 discrete slider with visual feedback |
| Multi-Movie First Take Modal | `/components/multi-first-take-modal.tsx` | Carousel for batch First Takes |
| First Take Settings Row | (inline in settings) | Toggle row with description |

### 5.2 Components to Modify

| Component | File Path | Changes Required |
|-----------|-----------|------------------|
| First Take Modal | `/components/first-take-modal.tsx` | Replace emoji picker with rating slider |
| First Take Card | `/components/cards/first-take-card.tsx` | Display numeric rating instead of emoji |
| Settings Screen | `/app/settings/index.tsx` | Add First Take prompt toggle |
| Movie Detail Screen | `/app/movie/[id].tsx` | Check preference before prompting |
| Ticket Review Screen | `/app/scan/review.tsx` | Add First Take flow after save |

### 5.3 First Take Modal Redesign

**Current Design (Emoji-based)**:
```
+------------------------------------------+
| [Handle Bar]                             |
|                                          |
|     Capture Your First Take              |
|          Movie Title                     |
|                                          |
| How did it make you feel?                |
| [emoji] [emoji] [emoji] [emoji] ...      |
|                                          |
| Your honest take                         |
| +--------------------------------------+ |
| | What's your immediate reaction?      | |
| +--------------------------------------+ |
| 100/140                                  |
|                                          |
| [ ] Contains spoilers                    |
|                                          |
| [Skip for now]      [Save]               |
+------------------------------------------+
```

**New Design (Rating-based)**:
```
+------------------------------------------+
| [Handle Bar]                             |
|                                          |
|     Your First Take                      |
|          Movie Title                     |
|                                          |
| Rate your experience (1-10)              |
|                                          |
|    1  2  3  4  5  6  7  8  9  10        |
|    [  ] [ ] [ ] [ ] [X] [ ] [ ] [ ]     |
|                                          |
|    * Your initial reaction rating        |
|                                          |
| Quick thoughts (optional)                |
| +--------------------------------------+ |
| | Share your immediate reaction...     | |
| +--------------------------------------+ |
| 100/140                                  |
|                                          |
| [ ] Contains spoilers                    |
|                                          |
| [Skip for now]      [Save First Take]    |
+------------------------------------------+
```

### 5.4 Rating Slider Component Specification

**File**: `/components/ui/rating-slider.tsx`

```typescript
interface RatingSliderProps {
  value: number | null;           // 1-10, null if not selected
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: 'default' | 'compact';   // compact for multi-movie flow
}
```

**Visual Design**:
- 10 circular buttons in a row
- Unselected: Border only, secondary color
- Selected: Filled with tint color, slight scale up
- Numbers 1-10 displayed inside circles
- Haptic feedback on selection (iOS)
- Colors gradient: 1-3 (neutral), 4-6 (warm), 7-8 (good), 9-10 (excellent/gold tint)

### 5.5 Multi-Movie First Take Flow

**Trigger**: After adding 2+ movies via ticket scan

**Design**:
```
+------------------------------------------+
| [X Close]                First Takes     |
|                         1 of 3 movies    |
|                                          |
|   +------------+                         |
|   | [Poster]   |  Movie Title            |
|   |            |  2024 Action            |
|   +------------+                         |
|                                          |
|    1  2  3  4  5  6  7  8  9  10        |
|    [  ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]     |
|                                          |
| +--------------------------------------+ |
| | Quick thoughts... (optional)         | |
| +--------------------------------------+ |
|                                          |
| [ ] Spoiler                              |
|                                          |
|   [Skip]                [Save & Next ->] |
|                                          |
|       o   o   o  (progress dots)         |
+------------------------------------------+
```

**Behavior**:
- Swipe left/right to navigate between movies
- "Skip" moves to next without saving
- "Save & Next" saves and advances
- Last movie shows "Done" instead of "Next"
- Can close at any time (saves completed takes)
- Progress persists if user backgrounds app

---

## 6. Trigger Points

### 6.1 First Take Prompt Triggers

| Trigger | Location | Condition | Priority |
|---------|----------|-----------|----------|
| Mark as Watched (manual) | Movie Detail | Toggle ON + no existing take | High |
| Add to Collection (single ticket) | Ticket Review | Toggle ON + no existing take | High |
| Add to Collection (multi-ticket) | Ticket Review | Toggle ON + any without takes | High |
| "Add First Take" button | Movie Detail | Movie is watched + no take | Medium |
| "Edit First Take" button | Movie Detail | Movie has existing take | Low |

### 6.2 Integration Points

#### Movie Detail Screen (`/app/movie/[id].tsx`)

**Current Flow**:
```
User taps "Watched" status
  -> changeStatus('watched')
  -> if (isChangingToWatched && !hasFirstTake)
       -> setShowFirstTakeModal(true)
```

**Required Change**:
```
User taps "Watched" status
  -> changeStatus('watched')
  -> if (isChangingToWatched && !hasFirstTake && preferences.firstTakePromptEnabled)
       -> setShowFirstTakeModal(true)
```

#### Ticket Review Screen (`/app/scan/review.tsx`)

**Current Flow**:
```
User taps "Add to Collection"
  -> addMovieToLibrary() for each ticket
  -> Show success alert
  -> Navigate to profile
```

**Required Change**:
```
User taps "Add to Collection"
  -> addMovieToLibrary() for each ticket
  -> if (preferences.firstTakePromptEnabled)
       -> if (validTickets.length === 1)
            -> Show single First Take modal
       -> else if (validTickets.length > 1)
            -> Show multi-movie First Take modal
  -> Show success alert
  -> Navigate to profile
```

---

## 7. API/Backend Requirements

### 7.1 Database Migrations

**Migration 1: Add Rating Column**
```sql
-- Migration: 20260124_add_first_take_rating.sql

-- Add rating column
ALTER TABLE first_takes
ADD COLUMN rating SMALLINT;

-- Add check constraint
ALTER TABLE first_takes
ADD CONSTRAINT first_takes_rating_range
CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));

-- Add deprecation comment
COMMENT ON COLUMN first_takes.reaction_emoji IS
'DEPRECATED: Use rating column instead. Kept for backwards compatibility with legacy data.';
```

**Migration 2: Add User Preference**
```sql
-- Migration: 20260124_add_first_take_preference.sql

-- Add preference to profiles table
ALTER TABLE profiles
ADD COLUMN first_take_prompt_enabled BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN profiles.first_take_prompt_enabled IS
'When true, prompts user for First Take after marking movie as watched.';
```

### 7.2 RLS Policies

The existing RLS policies on `first_takes` are sufficient:
- Users can only view/create/update/delete their own First Takes
- No additional policies needed for the preference column in profiles

### 7.3 Service Layer Updates

**File**: `/lib/first-take-service.ts`

Update `CreateFirstTakeData` interface:
```typescript
export interface CreateFirstTakeData {
  tmdbId: number;
  movieTitle: string;
  posterPath: string | null;
  rating: number;           // NEW: Required 1-10
  quoteText: string;
  isSpoiler?: boolean;
}
```

Update `createFirstTake` function to include rating in insert.

### 7.4 Hook Updates

**File**: `/hooks/use-first-take-actions.ts`

Update to pass rating through mutation chain.

**New File**: `/hooks/use-user-preferences.ts`

```typescript
export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const preferencesQuery = useQuery({
    queryKey: ['preferences', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_take_prompt_enabled')
        .eq('id', user!.id)
        .single();

      if (error) throw error;
      return {
        firstTakePromptEnabled: data.first_take_prompt_enabled ?? false,
      };
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ [key]: value })
        .eq('id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences', user?.id] });
    },
  });

  return {
    preferences: preferencesQuery.data ?? { firstTakePromptEnabled: false },
    isLoading: preferencesQuery.isLoading,
    updatePreference: (key: string, value: boolean) =>
      updateMutation.mutateAsync({ key, value }),
    isUpdating: updateMutation.isPending,
  };
}
```

---

## 8. Edge Cases

### 8.1 Existing First Take Scenarios

| Scenario | Behavior |
|----------|----------|
| User tries to add First Take for movie with existing take | Show edit modal with pre-filled data |
| User marks movie as watched but already has a First Take | Do not prompt, even if toggle is ON |
| User re-scans a ticket for movie already watched | Skip First Take prompt for that movie |

### 8.2 Multi-Movie Edge Cases

| Scenario | Behavior |
|----------|----------|
| All movies already have First Takes | Skip multi-movie flow entirely |
| Some movies have First Takes | Only show movies without takes in carousel |
| User closes modal mid-flow | Save completed takes, discard in-progress |
| Only 1 movie without take in batch | Use single-movie modal, not carousel |

### 8.3 Data Migration Edge Cases

| Scenario | Behavior |
|----------|----------|
| Legacy take with emoji, no rating | Display emoji in card, allow edit to add rating |
| New take created | Require rating, emoji set to empty string |
| Edit legacy take | Keep emoji if not changing, require rating if editing |

### 8.4 Spoiler Content

| Scenario | Behavior |
|----------|----------|
| User marks as spoiler | Quote text is blurred in feed/cards |
| Viewer taps blurred content | Reveal with confirmation ("Tap to reveal spoiler") |
| User's own spoiler content | Always visible (no blur for self) |
| Spoiler in multi-movie flow | Per-movie toggle, persists with save |

### 8.5 Preference Sync

| Scenario | Behavior |
|----------|----------|
| Preference changed mid-flow | Changes take effect on next trigger |
| Offline preference change | Queue update, sync when online |
| New user signup | Default to OFF, no migration needed |

---

## 9. Future Considerations

### 9.1 Public/Private Profiles

**Current**: First Takes are visible to friends only.

**Future Enhancement**:
- Add `visibility` column to `first_takes`: `'public' | 'friends' | 'private'`
- Default based on profile privacy setting
- Per-take override possible

### 9.2 First Take Visibility Settings

**Future Settings Screen**:
```
FIRST TAKES PRIVACY
+--------------------------------------------------+
| Who can see my First Takes        [Friends Only] |
+--------------------------------------------------+
| Options: Everyone, Friends Only, Only Me         |
+--------------------------------------------------+
```

### 9.3 Social Features

- First Take reactions (likes) from friends
- First Take comments from friends
- "Hot Takes" feed of recent friend First Takes
- Aggregate rating display on movie detail (friends' average)

### 9.4 Analytics Integration

Track for product insights:
- First Take completion rate when prompted
- Average rating distribution
- Spoiler toggle usage rate
- Skip rate for multi-movie flow
- Most common rating values

### 9.5 Share First Take as Image

Generate shareable card image with:
- Movie poster
- User's rating (stylized)
- Quote text
- Cinetrak branding
- Optional spoiler blur

---

## 10. Implementation Phases

### Phase 1: Foundation (Rating System Migration)
**Duration**: 2-3 days

**Tasks**:
1. Run database migration to add `rating` column
2. Run database migration to add `first_take_prompt_enabled` to profiles
3. Update TypeScript types in `/lib/database.types.ts`
4. Update `first-take-service.ts` to handle rating
5. Update `use-first-take-actions.ts` to pass rating
6. Create `use-user-preferences.ts` hook

**Verification**:
- [ ] Database migrations applied successfully
- [ ] TypeScript compiles without errors
- [ ] Can create First Take with rating via service

### Phase 2: Rating UI Components
**Duration**: 2-3 days

**Tasks**:
1. Create `RatingSlider` component
2. Redesign `FirstTakeModal` to use rating slider
3. Update `FirstTakeCard` to display numeric rating
4. Add backwards compatibility for legacy emoji-only takes

**Verification**:
- [ ] Rating slider works on iOS and Android
- [ ] Modal accepts rating input and saves correctly
- [ ] Cards display rating for new takes
- [ ] Cards display emoji for legacy takes

### Phase 3: Settings Integration
**Duration**: 1-2 days

**Tasks**:
1. Add First Take prompt toggle to Settings screen
2. Wire toggle to `use-user-preferences` hook
3. Add descriptive help text

**Verification**:
- [ ] Toggle appears in Settings > App Preferences
- [ ] Toggle state persists across app restarts
- [ ] Preference syncs to Supabase

### Phase 4: Trigger Point Integration
**Duration**: 2-3 days

**Tasks**:
1. Update Movie Detail screen to check preference before prompting
2. Add "Add First Take" button to watched movie detail
3. Add "Edit First Take" button if take exists
4. Update Ticket Review screen for single-movie prompt

**Verification**:
- [ ] Toggle OFF: No automatic prompts
- [ ] Toggle ON: Prompts after marking watched
- [ ] Manual "Add" button works regardless of toggle
- [ ] Single ticket scan prompts correctly

### Phase 5: Multi-Movie First Take Flow
**Duration**: 3-4 days

**Tasks**:
1. Create `MultiFirstTakeModal` component
2. Implement carousel/swipe navigation
3. Handle partial saves and skip logic
4. Integrate with Ticket Review screen

**Verification**:
- [ ] Multi-movie flow triggers for 2+ movies
- [ ] Can navigate between movies
- [ ] Skip and Save work correctly
- [ ] Closing mid-flow saves completed takes

### Phase 6: Polish and Edge Cases
**Duration**: 2 days

**Tasks**:
1. Implement spoiler blur on cards
2. Handle legacy emoji data gracefully
3. Add loading states and error handling
4. Accessibility review (VoiceOver, TalkBack)
5. Performance optimization

**Verification**:
- [ ] Spoiler blur works correctly
- [ ] Legacy takes display properly
- [ ] No crashes or data loss
- [ ] Accessible with screen readers

---

## Appendix A: File Changes Summary

### Files to Create
| File | Description |
|------|-------------|
| `/components/ui/rating-slider.tsx` | 1-10 rating input component |
| `/components/multi-first-take-modal.tsx` | Carousel modal for batch First Takes |
| `/hooks/use-user-preferences.ts` | User preferences hook |

### Files to Modify
| File | Changes |
|------|---------|
| `/lib/database.types.ts` | Add `rating` field, update types |
| `/lib/first-take-service.ts` | Handle rating in CRUD operations |
| `/hooks/use-first-take-actions.ts` | Pass rating through mutations |
| `/components/first-take-modal.tsx` | Replace emoji with rating slider |
| `/components/cards/first-take-card.tsx` | Display numeric rating |
| `/app/settings/index.tsx` | Add First Take toggle |
| `/app/movie/[id].tsx` | Check preference, add manual button |
| `/app/scan/review.tsx` | Integrate First Take prompts |

### Database Migrations
| Migration | Purpose |
|-----------|---------|
| `20260124_add_first_take_rating.sql` | Add rating column |
| `20260124_add_first_take_preference.sql` | Add preference column |

---

## Appendix B: Component Props Reference

### RatingSlider
```typescript
interface RatingSliderProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: 'default' | 'compact';
  showLabels?: boolean;
}
```

### FirstTakeModal (Updated)
```typescript
interface FirstTakeModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
  }) => Promise<void>;
  movieTitle: string;
  isSubmitting?: boolean;
  existingTake?: {
    rating: number;
    quoteText: string;
    isSpoiler: boolean;
  } | null;
}
```

### MultiFirstTakeModal
```typescript
interface MovieForFirstTake {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
}

interface MultiFirstTakeModalProps {
  visible: boolean;
  onClose: () => void;
  movies: MovieForFirstTake[];
  onComplete: () => void;
}
```

---

## Appendix C: Design Tokens

### Rating Colors
```typescript
const RATING_COLORS = {
  low: Colors.dark.textSecondary,      // 1-3
  medium: '#F59E0B',                    // 4-6 (Amber)
  high: '#22C55E',                      // 7-8 (Green)
  excellent: Colors.dark.gold,          // 9-10 (Gold)
};
```

### Modal Dimensions
```typescript
const MODAL_CONFIG = {
  maxHeight: '85%',
  borderRadius: BorderRadius.lg,
  padding: Spacing.lg,
  handleBarWidth: 36,
  handleBarHeight: 4,
};
```

---

*End of PRD*
