# PRD: First Takes Infinite Scroll Pagination

## Overview
Add infinite scroll pagination to the First Takes feed on the home screen, allowing users to doom-scroll through all takes without loading everything at once.

## Current State
- Home screen shows latest 20 First Takes
- No way to load more
- All 20 loaded in single request

## Goal State
- Initial load: 20 First Takes
- Scroll to bottom: Load next 20
- Smooth loading indicator
- Pull-to-refresh resets to latest

---

## Technical Approach

### Option A: Offset Pagination (Simpler)
```typescript
// Page 1: offset=0, limit=20
// Page 2: offset=20, limit=20
// Page 3: offset=40, limit=20

const { data } = await supabase
  .from('first_takes')
  .select('*')
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

**Pros:** Simple to implement
**Cons:** Can miss/duplicate items if new takes are added while scrolling

### Option B: Cursor Pagination (Recommended)
```typescript
// Use the last item's created_at as cursor
const { data } = await supabase
  .from('first_takes')
  .select('*')
  .order('created_at', { ascending: false })
  .lt('created_at', cursor) // Items older than cursor
  .limit(20);
```

**Pros:** Stable pagination, no duplicates
**Cons:** Slightly more complex

**Recommendation:** Use cursor-based with `created_at` timestamp.

---

## Implementation with TanStack Query

### 1. Create useInfiniteFirstTakes Hook

```typescript
// hooks/use-infinite-first-takes.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 20;

interface FirstTake {
  id: string;
  user_id: string;
  movie_id: number;
  movie_title: string;
  poster_path: string | null;
  quote_text: string;
  rating: number;
  is_spoiler: boolean;
  created_at: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

interface FirstTakesPage {
  data: FirstTake[];
  nextCursor: string | null;
}

async function fetchFirstTakesPage(cursor?: string): Promise<FirstTakesPage> {
  let query = supabase
    .from('first_takes')
    .select(`
      *,
      profiles:user_id (username, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) throw error;

  const nextCursor = data && data.length === PAGE_SIZE 
    ? data[data.length - 1].created_at 
    : null;

  return {
    data: data || [],
    nextCursor,
  };
}

export function useInfiniteFirstTakes() {
  return useInfiniteQuery({
    queryKey: ['first-takes', 'infinite'],
    queryFn: ({ pageParam }) => fetchFirstTakesPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
```

### 2. Update Home Screen Component

```typescript
// In home screen component
import { useInfiniteFirstTakes } from '@/hooks/use-infinite-first-takes';
import { FlashList } from '@shopify/flash-list'; // or FlatList

export function FirstTakesFeed() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useInfiniteFirstTakes();

  // Flatten pages into single array
  const firstTakes = data?.pages.flatMap(page => page.data) ?? [];

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const renderFooter = () => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" />
        <Text>Loading more...</Text>
      </View>
    );
  };

  return (
    <FlashList
      data={firstTakes}
      renderItem={({ item }) => <FirstTakeCard take={item} />}
      keyExtractor={(item) => item.id}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={renderFooter}
      refreshing={isRefetching}
      onRefresh={refetch}
      estimatedItemSize={150}
    />
  );
}
```

### 3. Loading States

```typescript
// Initial loading
if (isLoading) {
  return <FirstTakesSkeleton count={5} />;
}

// Error state
if (isError) {
  return (
    <EmptyState 
      icon="alert-circle"
      title="Couldn't load First Takes"
      action={{ label: "Try Again", onPress: refetch }}
    />
  );
}

// Empty state
if (firstTakes.length === 0) {
  return (
    <EmptyState
      icon="film"
      title="No First Takes yet"
      subtitle="Watch a movie and share your thoughts!"
    />
  );
}
```

---

## UX Considerations

### Loading Indicator
- Small spinner at bottom of list
- Text: "Loading more..." 
- Should not jump or cause layout shift

### End of List
- When `hasNextPage` is false, show subtle end indicator
- "You've seen all First Takes! 🎬"
- Or just stop showing loading indicator

### Pull to Refresh
- Resets to page 1 (latest takes)
- Standard iOS/Android pull gesture
- `refetch()` handles this

### Scroll Position
- FlashList/FlatList handles scroll position preservation
- New items don't shift current view

---

## Performance Notes

### Use FlashList
`@shopify/flash-list` is significantly faster than FlatList for long lists:
```bash
npm install @shopify/flash-list
```

### Estimated Item Size
Set `estimatedItemSize` to average First Take card height for better scroll performance.

### Cache Strategy
- `staleTime: 5 minutes` — Don't refetch if data is fresh
- Query key includes 'infinite' to separate from other first-takes queries
- `gcTime` (garbage collection) can be set to keep old pages in cache

---

## Testing Checklist

- [ ] Initial load shows first 20 takes
- [ ] Scrolling to bottom triggers load
- [ ] Loading indicator appears while fetching
- [ ] New page appends correctly (no duplicates)
- [ ] Pull-to-refresh works
- [ ] Empty state shows when no takes
- [ ] Error state shows on network failure
- [ ] End of list handled gracefully
- [ ] Performance is smooth with 100+ items

---

## Migration Path

1. Create new `useInfiniteFirstTakes` hook
2. Keep existing `useFirstTakes` for backwards compatibility
3. Update home screen to use infinite version
4. Test thoroughly
5. Remove old hook if no longer needed

---

## Timeline

| Task | Estimate |
|------|----------|
| Create useInfiniteFirstTakes hook | 1 hour |
| Update home screen component | 1 hour |
| Add loading/empty/error states | 30 min |
| Install and configure FlashList | 30 min |
| Testing | 1 hour |
| **Total** | **~4 hours** |

---

## Future Enhancements

- Filter by friends only (when social features exist)
- Filter by genre
- Search within First Takes
- Sort options (newest, highest rated, etc.)
