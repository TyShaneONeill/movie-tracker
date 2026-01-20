# PRD 002: Movie Lists View

## Context & Scope

**What**: Display user's custom movie lists on the Profile Lists tab with Letterboxd-inspired list cards showing a 2x2 poster grid cover, list name, description, and movie count.

**Why**: Users organize movies into themed collections (favorites, genre-specific, mood-based). Lists are a core social feature of movie tracking apps—they can be shared, discovered, and followed.

**Where**: `app/(tabs)/profile.tsx` → Lists tab

**Dependencies**:
- Need to create `user_lists` and `list_movies` database tables
- Need to create `useUserLists` hook
- Existing `ListCard` component (needs verification)

---

## Current State

### Existing Implementation
- **Profile Screen**: `app/(tabs)/profile.tsx` - Lists tab shows placeholder "Lists coming soon..."
- **List Card**: `components/cards/list-card.tsx` - Existing component with 2x2 grid
- **Mock Data**: `lib/mock-data/lists.ts` - `USER_LISTS` and `LIKED_LISTS` arrays
- **Modal**: `components/create-list-modal.tsx` - May exist for creating lists
- **Add to List Modal**: `components/add-to-list-modal.tsx` - May exist

### What's Working
- Tab UI structure
- ListCard component exists
- Mock data structure defined

### What's Missing
- Database schema for lists
- Type definitions for lists
- Hook to fetch user's lists
- Integration in profile Lists tab
- List detail route (`/list/[id]`)
- Navigation on card tap

---

## Success Criteria

- [ ] Lists tab displays user's movie lists in a vertical scroll
- [ ] Each list card shows: 2x2 poster grid, name, description (2 lines max), movie count
- [ ] Tapping a list navigates to `/list/[id]` (stub page for now)
- [ ] Empty state shows when user has no lists with "Create your first list" CTA
- [ ] Loading state shows skeleton cards while fetching
- [ ] Lists ordered by most recently updated
- [ ] TypeScript compiles without errors (`npm run lint`)
- [ ] Works in iOS simulator

---

## Technical Requirements

### Must Have

#### 1. Data Layer

**Database Schema** (via Supabase migration):

```sql
-- user_lists table
create table user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  is_public boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- list_movies junction table
create table list_movies (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references user_lists(id) on delete cascade not null,
  tmdb_id integer not null,
  title text not null,
  poster_path text,
  position integer not null default 0,
  added_at timestamp with time zone default now(),

  unique(list_id, tmdb_id)
);

-- Indexes
create index idx_user_lists_user_id on user_lists(user_id);
create index idx_list_movies_list_id on list_movies(list_id);
```

**Type Definitions** (`lib/database.types.ts`):

```typescript
export interface UserList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListMovie {
  id: string;
  list_id: string;
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  position: number;
  added_at: string;
}

export interface UserListWithMovies extends UserList {
  movies: ListMovie[];
  movie_count: number;
}
```

**Hook** (`hooks/use-user-lists.ts`):

```typescript
export function useUserLists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-lists', user?.id],
    queryFn: async () => {
      // Fetch lists with first 4 movies for cover
      const { data: lists, error } = await supabase
        .from('user_lists')
        .select(`
          *,
          list_movies (
            tmdb_id,
            title,
            poster_path,
            position
          )
        `)
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return lists.map(list => ({
        ...list,
        movies: list.list_movies
          .sort((a, b) => a.position - b.position)
          .slice(0, 4),
        movie_count: list.list_movies.length,
      }));
    },
    enabled: !!user?.id,
  });
}
```

#### 2. UI Layer
- [ ] Verify/update `ListCard` component matches design spec
- [ ] Create empty state with "Create your first list" button
- [ ] Create loading skeleton (3 list card placeholders)
- [ ] Integrate in profile Lists tab

#### 3. Navigation
- [ ] Create route stub at `app/list/[id].tsx`
- [ ] Wire tap handler to navigate: `router.push(\`/list/\${list.id}\`)`

### Nice to Have (Out of Scope for This PRD)
- Create new list button/FAB
- Long-press for list actions (edit, delete, share)
- Reorder lists (drag and drop)
- List sharing functionality
- Liked lists from other users

---

## Implementation Guidance

### Step 1: Database Migration

Use Supabase MCP or dashboard to create the tables:

```sql
-- Run via Supabase SQL editor or migration
create table user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  is_public boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table list_movies (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references user_lists(id) on delete cascade not null,
  tmdb_id integer not null,
  title text not null,
  poster_path text,
  position integer not null default 0,
  added_at timestamp with time zone default now(),
  unique(list_id, tmdb_id)
);

-- Enable RLS
alter table user_lists enable row level security;
alter table list_movies enable row level security;

-- RLS policies
create policy "Users can view own lists"
  on user_lists for select
  using (auth.uid() = user_id);

create policy "Users can create own lists"
  on user_lists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own lists"
  on user_lists for update
  using (auth.uid() = user_id);

create policy "Users can delete own lists"
  on user_lists for delete
  using (auth.uid() = user_id);

-- Similar policies for list_movies
create policy "Users can view movies in own lists"
  on list_movies for select
  using (
    exists (
      select 1 from user_lists
      where user_lists.id = list_movies.list_id
      and user_lists.user_id = auth.uid()
    )
  );

create policy "Users can add movies to own lists"
  on list_movies for insert
  with check (
    exists (
      select 1 from user_lists
      where user_lists.id = list_movies.list_id
      and user_lists.user_id = auth.uid()
    )
  );

create policy "Users can remove movies from own lists"
  on list_movies for delete
  using (
    exists (
      select 1 from user_lists
      where user_lists.id = list_movies.list_id
      and user_lists.user_id = auth.uid()
    )
  );
```

### Step 2: Add Type Definitions

**File**: `lib/database.types.ts`

Add the `UserList`, `ListMovie`, and `UserListWithMovies` interfaces.

### Step 3: Create Mock Data (for development)

**File**: `lib/mock-data/lists.ts` (update if exists)

```typescript
export const MOCK_USER_LISTS: UserListWithMovies[] = [
  {
    id: '1',
    user_id: 'user-1',
    name: 'All-Time Favorites',
    description: 'Movies I can watch over and over again',
    is_public: true,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
    movie_count: 24,
    movies: [
      { id: '1', list_id: '1', tmdb_id: 550, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', position: 0, added_at: '' },
      { id: '2', list_id: '1', tmdb_id: 680, title: 'Pulp Fiction', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', position: 1, added_at: '' },
      { id: '3', list_id: '1', tmdb_id: 155, title: 'The Dark Knight', poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', position: 2, added_at: '' },
      { id: '4', list_id: '1', tmdb_id: 27205, title: 'Inception', poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', position: 3, added_at: '' },
    ],
  },
  {
    id: '2',
    user_id: 'user-1',
    name: 'Weekend Comfort Watches',
    description: 'Perfect for lazy Sunday afternoons',
    is_public: false,
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-18T00:00:00Z',
    movie_count: 12,
    movies: [
      { id: '5', list_id: '2', tmdb_id: 508442, title: 'Soul', poster_path: '/hm58Jw4Lw8OIeECIq5qyPYhAeRJ.jpg', position: 0, added_at: '' },
      { id: '6', list_id: '2', tmdb_id: 862, title: 'Toy Story', poster_path: '/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg', position: 1, added_at: '' },
    ],
  },
  {
    id: '3',
    user_id: 'user-1',
    name: '2024 Watchlist',
    description: null,
    is_public: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
    movie_count: 8,
    movies: [],
  },
];
```

### Step 4: Create/Update useUserLists Hook

**File**: `hooks/use-user-lists.ts`

### Step 5: Verify ListCard Component

**File**: `components/cards/list-card.tsx`

Ensure it accepts these props:
```typescript
interface ListCardProps {
  name: string;
  description?: string | null;
  movieCount: number;
  posterUrls: (string | null)[];
  onPress: () => void;
}
```

### Step 6: Create List Detail Route Stub

**File**: `app/list/[id].tsx`

```typescript
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: colors.text }}>List Detail: {id}</Text>
      <Text style={{ color: colors.textSecondary }}>Coming soon...</Text>
    </View>
  );
}
```

### Step 7: Integrate in Profile Lists Tab

**File**: `app/(tabs)/profile.tsx`

```typescript
import { useUserLists } from '@/hooks/use-user-lists';
import { ListCard } from '@/components/cards/list-card';
import { getTMDBImageUrl } from '@/lib/tmdb.types';

// In component
const { data: userLists, isLoading: listsLoading, isError: listsError, refetch: refetchLists } = useUserLists();

const renderListsTab = () => {
  if (listsLoading) {
    return renderListsSkeleton();
  }

  if (listsError) {
    return renderListsError();
  }

  if (!userLists?.length) {
    return renderListsEmpty();
  }

  return (
    <ScrollView
      contentContainerStyle={styles.listsContent}
      showsVerticalScrollIndicator={false}
    >
      {userLists.map((list) => (
        <ListCard
          key={list.id}
          name={list.name}
          description={list.description}
          movieCount={list.movie_count}
          posterUrls={list.movies.map(m =>
            m.poster_path ? getTMDBImageUrl(m.poster_path, 'w185') : null
          )}
          onPress={() => router.push(`/list/${list.id}`)}
        />
      ))}
    </ScrollView>
  );
};
```

---

## Key Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/profile.tsx` | Main integration point |
| `hooks/use-user-lists.ts` | New hook to create |
| `components/cards/list-card.tsx` | Existing card component |
| `lib/database.types.ts` | Add type definitions |
| `lib/mock-data/lists.ts` | Mock data for development |
| `app/list/[id].tsx` | New route to create |
| `constants/theme.ts` | Styling constants |

---

## Design Specifications

### List Card Layout
- **Width**: Full width minus horizontal padding (`Spacing.md` × 2)
- **Padding**: `Spacing.md` (16px)
- **Background**: `colors.card`
- **Border Radius**: `BorderRadius.md` (16px)
- **Margin Bottom**: `Spacing.md` (16px)
- **Shadow**: `Shadows.sm`

### Cover Grid (2×2)
- **Size**: 80px × 80px total
- **Individual Poster**: 38px × 38px (with 4px gap)
- **Gap**: 4px
- **Border Radius**: `BorderRadius.sm` (8px) on outer corners
- **Empty Slots**: `colors.border` background

### Typography
- **List Name**: `Typography.display.h4`, `colors.text`, 1 line max (ellipsis)
- **Description**: `Typography.body.sm`, `colors.textSecondary`, 2 lines max (ellipsis)
- **Movie Count**: `Typography.body.xs`, `colors.textSecondary`, format: "24 movies"

### Empty State
- **Icon**: `albums-outline` from Ionicons, 48px, `colors.textSecondary`
- **Title**: "No lists yet", `Typography.display.h4`, `colors.text`
- **Subtitle**: "Create your first list to organize your movies", `Typography.body.sm`, `colors.textSecondary`
- **CTA Button**: "Create List" (optional for this PRD)

### Loading Skeleton
- **Count**: 3 skeleton list cards
- **Card Style**: Same dimensions, `backgroundColor: colors.card`

---

## Verification Steps

1. **Visual Check**: Open Profile → Lists tab shows list cards with 2×2 covers
2. **Content Check**: Each card shows name, description (truncated), movie count
3. **Navigation Check**: Tap any card → navigates to `/list/[id]`
4. **Empty State Check**: User with no lists sees empty state
5. **Loading Check**: Slow network shows skeleton cards
6. **Cover Grid Check**: Lists with <4 movies show placeholder slots
7. **Type Check**: Run `npm run lint` → no TypeScript errors

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| No lists | Show empty state with icon and CTA |
| Loading | Show 3 skeleton list cards |
| Network error | Show error message with "Try Again" button |
| List with 0 movies | Show 4 placeholder slots in cover |
| List with 1 movie | Show 1 poster + 3 placeholders |
| List with 2 movies | Show 2 posters + 2 placeholders |
| List with 3 movies | Show 3 posters + 1 placeholder |
| List with 4+ movies | Show first 4 posters |
| Long list name | Truncate with ellipsis (1 line) |
| Long description | Truncate with ellipsis (2 lines) |
| No description | Hide description area, adjust spacing |
| Missing poster | Show placeholder color |

---

## Ralph Loop Checkpoints

### Checkpoint 1: Database & Types ✓
- [ ] Database migration applied (tables created)
- [ ] RLS policies in place
- [ ] Type definitions added to `database.types.ts`
- [ ] Mock data created/updated
- [ ] Run `npm run lint` → passes

### Checkpoint 2: Hook & Data Layer ✓
- [ ] `useUserLists` hook created
- [ ] Hook fetches lists with movies
- [ ] Returns `isLoading`, `isError`, `data`, `refetch`
- [ ] Test with mock data or real Supabase

### Checkpoint 3: UI Components ✓
- [ ] `ListCard` component verified/updated
- [ ] Empty state component created
- [ ] Loading skeleton created
- [ ] Components render correctly in isolation

### Checkpoint 4: Integration ✓
- [ ] Profile Lists tab uses real hook data
- [ ] Navigation to list detail working
- [ ] List detail stub page exists
- [ ] All states (empty, loading, loaded, error) working

### Checkpoint 5: Final Verification ✓
- [ ] All success criteria met
- [ ] All edge cases handled
- [ ] `npm run lint` passes
- [ ] iOS simulator testing complete

---

## Commit Strategy

```bash
# After Checkpoint 1
git commit -m "feat(db): add user_lists and list_movies tables with RLS"

# After Checkpoint 2
git commit -m "feat(hooks): create useUserLists hook for fetching user lists"

# After Checkpoint 3
git commit -m "feat(components): update ListCard and add empty/loading states"

# After Checkpoint 4
git commit -m "feat(profile): integrate lists tab with real data and navigation"

# After Checkpoint 5
git commit -m "fix(profile): handle lists edge cases and polish"
```

---

## Future Considerations (Not in Scope)

These features should be separate PRDs:

1. **PRD: Create List Flow** - Modal to create new lists
2. **PRD: Add Movie to List** - Add movies from movie detail screen
3. **PRD: List Detail Screen** - Full list view with all movies, reordering
4. **PRD: Edit/Delete List** - Long-press actions, edit modal
5. **PRD: Public Lists & Discovery** - Browse/like other users' lists
