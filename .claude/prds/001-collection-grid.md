# PRD 001: Collection Grid Enhancement

## Context & Scope

**What**: Convert the Profile Collection tab from mock data to real Supabase data, displaying user's watched movies in an Instagram-style 3-column grid.

**Why**: Users need to see their actual movie collection—movies they've marked as "watched"—displayed visually on their profile. This is the core "showcase" feature of a movie tracking app.

**Where**: `app/(tabs)/profile.tsx` → Collection tab

**Dependencies**:
- Existing `user_movies` table with `status` field
- Existing `useUserMovies` hook
- Existing `CollectionGridCard` component

---

## Current State

### Existing Implementation
- **Profile Screen**: `app/(tabs)/profile.tsx` - Has tab structure with Collection/First Takes/Lists
- **Grid Card**: `components/cards/collection-grid-card.tsx` - Working 2:3 aspect ratio poster card
- **Mock Data**: `lib/mock-data/movies.ts` - `COLLECTION_MOVIES` array
- **Hook**: `hooks/use-user-movies.ts` - Fetches user movies (needs status filter)
- **Database**: `user_movies` table with `status: 'watchlist' | 'watching' | 'watched'`

### What's Working
- 3-column FlatList grid layout
- `CollectionGridCard` renders posters correctly
- Theme-aware styling
- Tab switching UI

### What's Missing
- Real data from Supabase (currently uses mock data)
- Status filtering in hook
- Empty state when no movies
- Loading state while fetching
- Navigation on poster tap

---

## Success Criteria

- [ ] Collection tab displays movies where `status='watched'` from Supabase
- [ ] Grid maintains 3-column layout with proper spacing
- [ ] Tapping a poster navigates to `/movie/[tmdb_id]`
- [ ] Empty state shows when user has no watched movies
- [ ] Loading state shows skeleton grid while fetching
- [ ] Pull-to-refresh reloads data
- [ ] TypeScript compiles without errors (`npm run lint`)
- [ ] Works in iOS simulator

---

## Technical Requirements

### Must Have

#### 1. Data Layer
- [ ] Extend `useUserMovies` hook to accept optional `status` filter parameter
- [ ] Query should return movies where `status='watched'` when filter applied
- [ ] Use TanStack Query for caching and automatic refetch
- [ ] Return `isLoading`, `isError`, `data`, `refetch` from hook

#### 2. UI Layer
- [ ] Replace `COLLECTION_MOVIES` mock data with real data from hook
- [ ] Create `CollectionEmptyState` component or inline empty state
- [ ] Create loading skeleton (9 placeholder cards in grid)
- [ ] Wire up `onPress` to navigate: `router.push(\`/movie/\${movie.tmdb_id}\`)`

#### 3. Interaction Layer
- [ ] Tap poster → navigate to movie detail screen
- [ ] Pull-to-refresh using FlatList's `onRefresh` prop
- [ ] Show refresh indicator while refreshing

### Nice to Have (Out of Scope for This PRD)
- Sort options (recently added, alphabetical, rating)
- Filter by genre
- Multi-select for bulk actions
- Search within collection

---

## Implementation Guidance

### Step 1: Extend useUserMovies Hook

**File**: `hooks/use-user-movies.ts`

```typescript
// Add optional status filter parameter
export function useUserMovies(status?: MovieStatus) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-movies', user?.id, status],
    queryFn: async () => {
      let query = supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}
```

### Step 2: Create Empty State

**Option A**: Inline in profile.tsx
```typescript
const renderEmptyCollection = () => (
  <View style={styles.emptyContainer}>
    <Ionicons name="film-outline" size={48} color={colors.textSecondary} />
    <Text style={[styles.emptyTitle, { color: colors.text }]}>
      No movies yet
    </Text>
    <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
      Movies you mark as watched will appear here
    </Text>
  </View>
);
```

**Option B**: Reusable component at `components/empty-state.tsx`

### Step 3: Create Loading Skeleton

```typescript
const renderLoadingSkeleton = () => (
  <View style={styles.skeletonGrid}>
    {Array.from({ length: 9 }).map((_, index) => (
      <View
        key={index}
        style={[styles.skeletonCard, { backgroundColor: colors.card }]}
      />
    ))}
  </View>
);
```

### Step 4: Update Profile Collection Tab

**File**: `app/(tabs)/profile.tsx`

```typescript
// Import hook
import { useUserMovies } from '@/hooks/use-user-movies';

// In component
const {
  data: watchedMovies,
  isLoading,
  isError,
  refetch,
  isRefetching
} = useUserMovies('watched');

// In renderCollectionTab
const renderCollectionTab = () => {
  if (isLoading) {
    return renderLoadingSkeleton();
  }

  if (isError) {
    return renderErrorState();
  }

  if (!watchedMovies?.length) {
    return renderEmptyCollection();
  }

  return (
    <FlatList
      data={watchedMovies}
      renderItem={renderCollectionItem}
      keyExtractor={(item) => item.id}
      numColumns={3}
      columnWrapperStyle={styles.collectionRow}
      contentContainerStyle={styles.collectionContent}
      onRefresh={refetch}
      refreshing={isRefetching}
    />
  );
};

// Update renderCollectionItem to use real data shape
const renderCollectionItem = ({ item }: { item: UserMovie }) => (
  <Pressable
    style={styles.collectionItem}
    onPress={() => router.push(`/movie/${item.tmdb_id}`)}
  >
    <CollectionGridCard posterPath={item.poster_path} />
  </Pressable>
);
```

---

## Key Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/profile.tsx` | Main integration point |
| `hooks/use-user-movies.ts` | Hook to extend with status filter |
| `components/cards/collection-grid-card.tsx` | Existing card component |
| `lib/database.types.ts` | `UserMovie` type definition |
| `constants/theme.ts` | `Colors`, `Spacing`, `BorderRadius` |

---

## Design Specifications

### Grid Layout
- **Columns**: 3
- **Gap**: `Spacing.sm` (8px)
- **Poster Aspect Ratio**: 2:3 (already in CollectionGridCard)
- **Content Padding**: `Spacing.md` (16px) horizontal

### Empty State
- **Icon**: `film-outline` from Ionicons, 48px, `colors.textSecondary`
- **Title**: "No movies yet", `Typography.display.h4`, `colors.text`
- **Subtitle**: "Movies you mark as watched will appear here", `Typography.body.sm`, `colors.textSecondary`
- **Layout**: Centered vertically and horizontally

### Loading Skeleton
- **Count**: 9 cards (3x3 grid)
- **Card Style**: Same dimensions as real cards, `backgroundColor: colors.card`
- **Animation**: Optional subtle pulse/shimmer

### Error State
- **Icon**: `alert-circle-outline`, 48px, `colors.tint`
- **Title**: "Something went wrong"
- **Button**: "Try Again" → calls `refetch()`

---

## Verification Steps

1. **Visual Check**: Open Profile → Collection tab shows real watched movies in 3-column grid
2. **Navigation Check**: Tap any poster → navigates to correct movie detail page
3. **Empty State Check**: User with no watched movies sees empty state message
4. **Loading Check**: Slow network (use Network Link Conditioner) shows skeleton
5. **Error Check**: Disable network → see error state with retry button
6. **Refresh Check**: Pull down → loading indicator → data refreshes
7. **Type Check**: Run `npm run lint` → no TypeScript errors

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| No watched movies | Show empty state with icon and message |
| Loading | Show 9 skeleton placeholder cards |
| Network error | Show error message with "Try Again" button |
| Single movie | Grid maintains alignment (1 card in first column) |
| 2 movies | Grid maintains alignment (2 cards in first row) |
| Offline (cached) | Show cached data, indicate stale if possible |
| Very long collection (100+) | FlatList handles virtualization automatically |

---

## Ralph Loop Checkpoints

### Checkpoint 1: Data Layer ✓
- [ ] `useUserMovies` hook accepts optional `status` parameter
- [ ] Query filters correctly when status provided
- [ ] Hook returns `isLoading`, `isError`, `data`, `refetch`
- [ ] Run `npm run lint` → passes

### Checkpoint 2: Empty/Loading States ✓
- [ ] Empty state component/function created
- [ ] Loading skeleton renders 9 cards
- [ ] Error state with retry button created
- [ ] Test each state in isolation

### Checkpoint 3: Integration ✓
- [ ] Profile Collection tab uses real data
- [ ] `renderCollectionItem` uses `UserMovie` type
- [ ] Navigation wired up correctly
- [ ] Pull-to-refresh working

### Checkpoint 4: Final Verification ✓
- [ ] All success criteria met
- [ ] All edge cases handled
- [ ] `npm run lint` passes
- [ ] iOS simulator testing complete

---

## Commit Strategy

```bash
# After Checkpoint 1
git commit -m "feat(hooks): add status filter to useUserMovies hook"

# After Checkpoint 2
git commit -m "feat(profile): add empty, loading, and error states for collection"

# After Checkpoint 3
git commit -m "feat(profile): integrate real collection data with navigation"

# After Checkpoint 4
git commit -m "fix(profile): handle collection edge cases and polish"
```
