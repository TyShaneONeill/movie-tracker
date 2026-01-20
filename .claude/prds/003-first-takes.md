# PRD 003: First Takes - Movie Reviews Feed

## Context & Scope

**What**: Display an iMessage-style feed of quick movie reactions/reviews ("First Takes") on the Profile First Takes tab. Each take captures a user's immediate reaction after watching a movie.

**Why**: First Takes are the "hot take" feature—quick, spoiler-free first impressions captured right after watching. Unlike full reviews, they're meant to be emotional, immediate, and shareable.

**Where**: `app/(tabs)/profile.tsx` → First Takes tab

**Dependencies**:
- Need to create `first_takes` database table
- Need to create `useFirstTakes` hook
- Need to create `FirstTakeCard` component

---

## Current State

### Existing Implementation
- **Profile Screen**: `app/(tabs)/profile.tsx` - First Takes tab shows single mock "Latest Snapshot" card
- **Mock Structure**: Hardcoded in profile.tsx (lines 47-75)
- **Similar Pattern**: `FeedItemCard` component exists for activity feed

### What's Working
- Tab UI structure
- Basic card layout concept in mock
- Theme-aware styling patterns

### What's Missing
- Database schema for first takes
- Type definitions
- Hook to fetch first takes
- Reusable `FirstTakeCard` component
- Multiple first takes display
- Proper timestamp formatting
- Navigation on card tap

---

## Success Criteria

- [ ] First Takes tab displays user's movie reviews in a chronological feed
- [ ] Each take shows: movie poster thumbnail, title, relative timestamp, emoji reaction, quote text
- [ ] Most recent take has gold left border accent ("Latest Snapshot" header)
- [ ] Tapping a take navigates to `/movie/[tmdb_id]`
- [ ] Empty state shows when user has no first takes
- [ ] Loading state shows skeleton cards while fetching
- [ ] Relative timestamps display correctly ("Just now", "5m ago", "2h ago", "Jan 15")
- [ ] TypeScript compiles without errors (`npm run lint`)
- [ ] Works in iOS simulator

---

## Technical Requirements

### Must Have

#### 1. Data Layer

**Database Schema** (via Supabase migration):

```sql
-- first_takes table
create table first_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  tmdb_id integer not null,
  movie_title text not null,
  poster_path text,
  reaction_emoji text not null default '🎬',
  quote_text text not null,
  is_spoiler boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  -- Prevent duplicate takes for same movie
  unique(user_id, tmdb_id)
);

-- Index for user queries
create index idx_first_takes_user_id on first_takes(user_id);
create index idx_first_takes_created_at on first_takes(created_at desc);

-- Enable RLS
alter table first_takes enable row level security;

-- RLS policies
create policy "Users can view own first takes"
  on first_takes for select
  using (auth.uid() = user_id);

create policy "Users can create first takes"
  on first_takes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own first takes"
  on first_takes for update
  using (auth.uid() = user_id);

create policy "Users can delete own first takes"
  on first_takes for delete
  using (auth.uid() = user_id);
```

**Type Definitions** (`lib/database.types.ts`):

```typescript
export interface FirstTake {
  id: string;
  user_id: string;
  tmdb_id: number;
  movie_title: string;
  poster_path: string | null;
  reaction_emoji: string;
  quote_text: string;
  is_spoiler: boolean;
  created_at: string;
  updated_at: string;
}

export type FirstTakeInsert = Omit<FirstTake, 'id' | 'created_at' | 'updated_at'>;
export type FirstTakeUpdate = Partial<Omit<FirstTake, 'id' | 'user_id' | 'created_at'>>;
```

**Hook** (`hooks/use-first-takes.ts`):

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { FirstTake } from '@/lib/database.types';

export function useFirstTakes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['first-takes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('first_takes')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as FirstTake[];
    },
    enabled: !!user?.id,
  });
}
```

#### 2. Utility Functions

**Relative Timestamp** (`utils/date-format.ts` or `lib/utils.ts`):

```typescript
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  // For older dates, show formatted date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
```

#### 3. UI Layer

**FirstTakeCard Component** (`components/cards/first-take-card.tsx`):

```typescript
import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { formatRelativeTime } from '@/lib/utils';

interface FirstTakeCardProps {
  movieTitle: string;
  posterPath: string | null;
  emoji: string;
  quote: string;
  createdAt: string;
  isLatest?: boolean;
  onPress: () => void;
}

export function FirstTakeCard({
  movieTitle,
  posterPath,
  emoji,
  quote,
  createdAt,
  isLatest = false,
  onPress,
}: FirstTakeCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: colors.card,
          borderLeftColor: isLatest ? colors.gold : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={onPress}
    >
      {/* Header: Poster + Title/Time + Emoji */}
      <View style={styles.header}>
        <View style={styles.movieInfo}>
          <Image
            source={{
              uri: posterPath
                ? getTMDBImageUrl(posterPath, 'w92')
                : undefined,
            }}
            style={[styles.poster, { backgroundColor: colors.border }]}
          />
          <View style={styles.titleContainer}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={1}
            >
              {movieTitle}
            </Text>
            <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
              {formatRelativeTime(createdAt)}
            </Text>
          </View>
        </View>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>

      {/* Quote */}
      <Text style={[styles.quote, { color: colors.text }]}>
        "{quote}"
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  movieInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  poster: {
    width: 30,
    height: 45,
    borderRadius: 4,
  },
  titleContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  title: {
    ...Typography.body.base,
    fontWeight: '600',
  },
  timestamp: {
    ...Typography.body.xs,
    marginTop: 2,
  },
  emoji: {
    fontSize: 24,
    marginLeft: Spacing.sm,
  },
  quote: {
    ...Typography.body.base,
    fontStyle: 'italic',
    lineHeight: 22,
  },
});
```

- [ ] Create `FirstTakeCard` component
- [ ] Create empty state for no first takes
- [ ] Create loading skeleton (3 skeleton cards)
- [ ] Add section header "LATEST SNAPSHOT" for most recent

#### 4. Integration
- [ ] Wire up profile First Takes tab with hook
- [ ] Show "LATEST SNAPSHOT" header above first item
- [ ] Navigation on tap: `router.push(\`/movie/\${take.tmdb_id}\`)`

### Nice to Have (Out of Scope for This PRD)
- Create new first take button (FAB)
- Edit/delete existing takes
- Spoiler warning toggle with blur
- Share take as image
- Public feed of all first takes

---

## Implementation Guidance

### Step 1: Database Migration

Apply via Supabase MCP or dashboard:

```sql
create table first_takes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  tmdb_id integer not null,
  movie_title text not null,
  poster_path text,
  reaction_emoji text not null default '🎬',
  quote_text text not null,
  is_spoiler boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, tmdb_id)
);

create index idx_first_takes_user_id on first_takes(user_id);
alter table first_takes enable row level security;

create policy "Users can view own first takes"
  on first_takes for select using (auth.uid() = user_id);

create policy "Users can create first takes"
  on first_takes for insert with check (auth.uid() = user_id);

create policy "Users can update own first takes"
  on first_takes for update using (auth.uid() = user_id);

create policy "Users can delete own first takes"
  on first_takes for delete using (auth.uid() = user_id);
```

### Step 2: Add Type Definitions

**File**: `lib/database.types.ts`

Add `FirstTake`, `FirstTakeInsert`, `FirstTakeUpdate` types.

### Step 3: Create Mock Data

**File**: `lib/mock-data/first-takes.ts`

```typescript
import { FirstTake } from '@/lib/database.types';

const now = new Date();
const minutesAgo = (mins: number) => new Date(now.getTime() - mins * 60 * 1000).toISOString();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

export const MOCK_FIRST_TAKES: FirstTake[] = [
  {
    id: '1',
    user_id: 'user-1',
    tmdb_id: 550,
    movie_title: 'Fight Club',
    poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    reaction_emoji: '🤯',
    quote_text: 'The ending completely rewired my brain. I need to watch this again immediately.',
    is_spoiler: false,
    created_at: minutesAgo(5),
    updated_at: minutesAgo(5),
  },
  {
    id: '2',
    user_id: 'user-1',
    tmdb_id: 680,
    movie_title: 'Pulp Fiction',
    poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
    reaction_emoji: '😎',
    quote_text: 'Pure cinema. Every scene is iconic. Tarantino at his absolute best.',
    is_spoiler: false,
    created_at: hoursAgo(3),
    updated_at: hoursAgo(3),
  },
  {
    id: '3',
    user_id: 'user-1',
    tmdb_id: 155,
    movie_title: 'The Dark Knight',
    poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    reaction_emoji: '🦇',
    quote_text: 'Heath Ledger deserved every award. This transcends the superhero genre.',
    is_spoiler: false,
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
  {
    id: '4',
    user_id: 'user-1',
    tmdb_id: 27205,
    movie_title: 'Inception',
    poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    reaction_emoji: '🌀',
    quote_text: 'My mind is still spinning. Nolan created a masterpiece of layered storytelling.',
    is_spoiler: false,
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
  },
  {
    id: '5',
    user_id: 'user-1',
    tmdb_id: 278,
    movie_title: 'The Shawshank Redemption',
    poster_path: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
    reaction_emoji: '🥹',
    quote_text: 'Hope is a beautiful thing. This movie restored my faith in storytelling.',
    is_spoiler: false,
    created_at: daysAgo(7),
    updated_at: daysAgo(7),
  },
];
```

### Step 4: Create Relative Time Utility

**File**: `lib/utils.ts` (add to existing or create)

### Step 5: Create useFirstTakes Hook

**File**: `hooks/use-first-takes.ts`

### Step 6: Create FirstTakeCard Component

**File**: `components/cards/first-take-card.tsx`

### Step 7: Integrate in Profile First Takes Tab

**File**: `app/(tabs)/profile.tsx`

```typescript
import { useFirstTakes } from '@/hooks/use-first-takes';
import { FirstTakeCard } from '@/components/cards/first-take-card';

// In component
const { data: firstTakes, isLoading: takesLoading, isError: takesError, refetch: refetchTakes } = useFirstTakes();

const renderFirstTakesTab = () => {
  if (takesLoading) {
    return renderFirstTakesSkeleton();
  }

  if (takesError) {
    return renderFirstTakesError();
  }

  if (!firstTakes?.length) {
    return renderFirstTakesEmpty();
  }

  return (
    <ScrollView
      contentContainerStyle={styles.firstTakesContent}
      showsVerticalScrollIndicator={false}
    >
      {firstTakes.map((take, index) => (
        <View key={take.id}>
          {index === 0 && (
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
              LATEST SNAPSHOT
            </Text>
          )}
          <FirstTakeCard
            movieTitle={take.movie_title}
            posterPath={take.poster_path}
            emoji={take.reaction_emoji}
            quote={take.quote_text}
            createdAt={take.created_at}
            isLatest={index === 0}
            onPress={() => router.push(`/movie/${take.tmdb_id}`)}
          />
        </View>
      ))}
    </ScrollView>
  );
};

// Styles
const styles = StyleSheet.create({
  // ... existing styles
  sectionHeader: {
    ...Typography.body.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  firstTakesContent: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
});
```

---

## Key Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/profile.tsx` | Main integration point |
| `hooks/use-first-takes.ts` | New hook to create |
| `components/cards/first-take-card.tsx` | New component to create |
| `components/cards/feed-item-card.tsx` | Similar pattern reference |
| `lib/database.types.ts` | Add type definitions |
| `lib/mock-data/first-takes.ts` | New mock data file |
| `lib/utils.ts` | Add formatRelativeTime |
| `constants/theme.ts` | Styling constants |

---

## Design Specifications

### First Take Card Layout
- **Width**: Full width minus horizontal padding
- **Padding**: `Spacing.md` (16px)
- **Background**: `colors.card`
- **Border Radius**: `BorderRadius.md` (16px)
- **Border Left**: 4px solid (`colors.gold` for latest, `transparent` otherwise)
- **Margin Bottom**: `Spacing.md` (16px)

### Header Row (Flexbox)
- **Direction**: `row`, `space-between`
- **Left Side**: Poster + Title/Timestamp column
- **Right Side**: Emoji

### Poster Thumbnail
- **Width**: 30px
- **Height**: 45px (2:3 ratio)
- **Border Radius**: 4px
- **Placeholder**: `colors.border` background

### Typography
- **Movie Title**: `Typography.body.base`, `fontWeight: '600'`, `colors.text`, 1 line max
- **Timestamp**: `Typography.body.xs`, `colors.textSecondary`
- **Emoji**: `fontSize: 24`
- **Quote**: `Typography.body.base`, `fontStyle: 'italic'`, `lineHeight: 22`, `colors.text`
- **Quote Marks**: Use typographic quotes `"..."`

### Section Header
- **Text**: "LATEST SNAPSHOT"
- **Style**: `Typography.body.xs`, `textTransform: 'uppercase'`, `letterSpacing: 1`
- **Color**: `colors.textSecondary`
- **Margin Bottom**: `Spacing.sm` (8px)
- **Only shown**: Above the first (most recent) take

### Empty State
- **Icon**: `chatbubble-ellipses-outline` from Ionicons, 48px, `colors.textSecondary`
- **Title**: "No first takes yet", `Typography.display.h4`, `colors.text`
- **Subtitle**: "Share your thoughts right after watching a movie", `Typography.body.sm`, `colors.textSecondary`

### Loading Skeleton
- **Count**: 3 skeleton cards
- **Card Style**: Same dimensions as real cards
- **Elements**: Poster placeholder, 2 text lines, emoji placeholder

---

## Timestamp Formatting Rules

| Time Difference | Display Format |
|-----------------|----------------|
| < 1 minute | "Just now" |
| 1-59 minutes | "Xm ago" (e.g., "5m ago") |
| 1-23 hours | "Xh ago" (e.g., "3h ago") |
| 1-6 days | "Xd ago" (e.g., "2d ago") |
| 7+ days (same year) | "Jan 15" |
| Previous year | "Jan 15, 2025" |

---

## Verification Steps

1. **Visual Check**: Open Profile → First Takes tab shows feed of review cards
2. **Latest Highlight**: First/most recent take has gold left border
3. **Section Header**: "LATEST SNAPSHOT" appears above first take only
4. **Content Check**: Each card shows poster, title, timestamp, emoji, quote
5. **Timestamp Check**: Timestamps display correctly for various ages
6. **Navigation Check**: Tap any card → navigates to correct movie detail
7. **Empty State Check**: User with no takes sees empty state
8. **Loading Check**: Slow network shows skeleton cards
9. **Quote Formatting**: Quotes have proper typographic quote marks
10. **Type Check**: Run `npm run lint` → no TypeScript errors

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| No first takes | Show empty state with icon and message |
| Loading | Show 3 skeleton cards |
| Network error | Show error message with "Try Again" button |
| Single take | Show with "LATEST SNAPSHOT" header and gold border |
| Very long quote | Allow natural text wrapping (no truncation) |
| Missing poster | Show placeholder with `colors.border` background |
| Missing emoji | Default to 🎬 (movie emoji) |
| Very old take (>1 year) | Show full date with year |
| Take created "just now" | Show "Just now" |

---

## Available Emoji Reactions

Suggested emoji set for first takes (for future "create" feature):

| Emoji | Meaning |
|-------|---------|
| 🤯 | Mind-blown |
| 😭 | Made me cry |
| 😍 | Loved it |
| 😎 | Cool/stylish |
| 🥹 | Emotional |
| 🔥 | Fire/amazing |
| 💀 | Dead (from laughter or shock) |
| 🫠 | Overwhelmed |
| 🦇 | Dark/edgy (Batman vibes) |
| 🌀 | Confusing/trippy |
| 👻 | Scary |
| 🎬 | Classic/default |

---

## Ralph Loop Checkpoints

### Checkpoint 1: Database & Types ✓
- [ ] Database migration applied (`first_takes` table created)
- [ ] RLS policies in place
- [ ] Type definitions added to `database.types.ts`
- [ ] Run `npm run lint` → passes

### Checkpoint 2: Utilities & Mock Data ✓
- [ ] `formatRelativeTime` utility function created
- [ ] Mock data created with varied timestamps
- [ ] Test timestamp formatting with different dates
- [ ] Run `npm run lint` → passes

### Checkpoint 3: Hook Created ✓
- [ ] `useFirstTakes` hook created
- [ ] Returns `isLoading`, `isError`, `data`, `refetch`
- [ ] Ordered by `created_at` descending
- [ ] Test with mock data or real Supabase

### Checkpoint 4: Component Built ✓
- [ ] `FirstTakeCard` component created
- [ ] Accepts all required props
- [ ] Renders correctly with mock data
- [ ] Gold border shows when `isLatest={true}`
- [ ] Press feedback working

### Checkpoint 5: Integration ✓
- [ ] Profile First Takes tab uses real hook
- [ ] "LATEST SNAPSHOT" header shows above first item
- [ ] Navigation to movie detail working
- [ ] All states (empty, loading, loaded, error) working

### Checkpoint 6: Final Verification ✓
- [ ] All success criteria met
- [ ] All edge cases handled
- [ ] `npm run lint` passes
- [ ] iOS simulator testing complete

---

## Commit Strategy

```bash
# After Checkpoint 1
git commit -m "feat(db): add first_takes table with RLS policies"

# After Checkpoint 2
git commit -m "feat(utils): add formatRelativeTime utility and first takes mock data"

# After Checkpoint 3
git commit -m "feat(hooks): create useFirstTakes hook"

# After Checkpoint 4
git commit -m "feat(components): create FirstTakeCard component"

# After Checkpoint 5
git commit -m "feat(profile): integrate first takes tab with real data"

# After Checkpoint 6
git commit -m "fix(profile): handle first takes edge cases and polish"
```

---

## Future Considerations (Not in Scope)

These features should be separate PRDs:

1. **PRD: Create First Take Flow** - Modal/screen to write a new first take
2. **PRD: Edit/Delete First Take** - Long-press actions
3. **PRD: Spoiler Toggle** - Blur spoiler takes until tapped
4. **PRD: Share First Take** - Generate shareable image
5. **PRD: Public First Takes Feed** - Discover other users' takes
6. **PRD: First Take on Movie Detail** - Show user's take on movie detail screen
