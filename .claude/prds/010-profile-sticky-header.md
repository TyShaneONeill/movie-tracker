# PRD: Profile Screen Sticky Header

## Overview
Transform the profile screen header into a collapsible sticky navigation that minimizes as the user scrolls through their collection.

## Current Behavior
- Profile info (avatar, name, stats) + tabs stay at top
- Entire header is static — takes up screen space when browsing movies
- User loses context of which tab they're on when scrolling deep

## Desired Behavior

### Initial State (scroll position = 0)
```
┌─────────────────────────────┐
│  ←  Profile            ⚙️   │  ← Nav bar
├─────────────────────────────┤
│         [Avatar]            │
│        Display Name         │
│    🎬 42  ⭐ 28  📋 5       │  ← Stats (movies, ratings, lists)
├─────────────────────────────┤
│ Collection | First Takes | Lists │  ← Tabs
├─────────────────────────────┤
│  🎬  🎬  🎬  🎬            │
│  🎬  🎬  🎬  🎬            │  ← Movie grid
│  🎬  🎬  🎬  🎬            │
```

### Scrolled State (scroll position > threshold)
```
┌─────────────────────────────┐
│  ←  Profile            ⚙️   │  ← Nav bar (stays)
├─────────────────────────────┤
│ Collection | First Takes | Lists │  ← Tabs become sticky
├─────────────────────────────┤
│  🎬  🎬  🎬  🎬            │
│  🎬  🎬  🎬  🎬            │  ← More room for content!
│  🎬  🎬  🎬  🎬            │
│  🎬  🎬  🎬  🎬            │
```

## Technical Approach

### Option A: Animated Header (Recommended)
Use `react-native-reanimated` + scroll position to:
1. Track scroll offset with `useAnimatedScrollHandler`
2. Interpolate header height (full → collapsed)
3. Fade out avatar/name/stats as user scrolls
4. Keep tabs pinned at top

```typescript
const scrollY = useSharedValue(0);
const headerHeight = useAnimatedStyle(() => ({
  height: interpolate(scrollY.value, [0, 150], [200, 0], 'clamp'),
  opacity: interpolate(scrollY.value, [0, 100], [1, 0], 'clamp'),
}));
```

### Option B: Simple Sticky Tabs
Use `stickyHeaderIndices` on ScrollView/FlatList:
- Less smooth but simpler
- Tabs just stick when they hit the top

### Option C: SectionList with Sticky Header
- Built-in sticky section headers
- Works well with the tab structure

## Implementation Steps

1. **Wrap content in Animated.ScrollView**
   - Track scroll position with shared value

2. **Create collapsible header component**
   - Profile section with animated height/opacity
   - Tabs section that stays visible

3. **Handle tab switching**
   - Maintain scroll position per tab (optional)
   - Or reset to top on tab change

4. **Polish**
   - Smooth spring animation on collapse
   - Maybe subtle shadow on sticky tabs
   - Haptic feedback at collapse threshold (optional)

## Edge Cases

- **Pull to refresh**: Should expand header back
- **Tab switch**: Scroll to top, expand header
- **Deep link to tab**: Start collapsed if content exists
- **Empty state**: Don't collapse if nothing to scroll

## Dependencies

Already in project:
- `react-native-reanimated` (check if installed)
- `expo-haptics` (optional)

## Effort Estimate

| Task | Time |
|------|------|
| Animated scroll tracking | 1 hour |
| Collapsible header component | 1.5 hours |
| Tab integration | 1 hour |
| Polish & edge cases | 1 hour |
| **Total** | **~4.5 hours** |

## Success Criteria

- [ ] Header collapses smoothly when scrolling down
- [ ] Tabs remain accessible (sticky) at all scroll positions
- [ ] Header expands when scrolling back to top
- [ ] No jank or performance issues on older devices
- [ ] Works correctly for all three tabs

## Future Enhancements

- Parallax effect on avatar during collapse
- Mini avatar in nav bar when collapsed
- Animated stats that slide into nav bar
