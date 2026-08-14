/**
 * PocketStubs Design System — sync entry for claude.ai/design.
 * Re-exports the app's real components (compiled via react-native-web).
 * Scope decided 2026-08-03 with Ty: presentational, props-only components.
 */

// Providers
export { ForcedThemeProvider } from '../../lib/theme-context';

// Composed preview/app provider: react-query must come from THIS bundle's copy
// (an external QueryClientProvider creates a different React context and
// useQueryClient still throws — found by wave-cards on ReviewCard/LikeButton).
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedThemeProvider as _FTP } from '../../lib/theme-context';

const previewQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } },
});

export function PocketStubsProvider({ theme = 'dark', children }: { theme?: 'light' | 'dark'; children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider as unknown as React.ComponentType<{ client: QueryClient; children?: React.ReactNode }>,
    { client: previewQueryClient },
    React.createElement(_FTP, { theme, children } as any),
  );
}

// Tokens (constants — consumed as JS, mirrored into styles.css for reference)
export { Colors, Spacing, BorderRadius, FontSizes, Fonts } from '../../constants/theme';
export { Typography } from '../../constants/typography';

// Core primitives
export { ThemedText } from '../../components/themed-text';
export { ThemedView } from '../../components/themed-view';
export { ContentContainer } from '../../components/content-container';

// UI kit
export { ActionSheet } from '../../components/ui/action-sheet';
export { BottomNavBar } from '../../components/ui/bottom-nav-bar';
export { BottomSheetModalComponent as BottomSheetModal } from '../../components/ui/bottom-sheet-modal';
export { Collapsible } from '../../components/ui/collapsible';
export { default as GlassBackButton } from '../../components/ui/glass-back-button';
export { default as IconButton } from '../../components/ui/icon-button';
export { IconSymbol } from '../../components/ui/icon-symbol';
export { PerforatedEdge } from '../../components/ui/perforated-edge';
export { RatingSlider } from '../../components/ui/rating-slider';
export { SectionHeader } from '../../components/ui/section-header';
export { StarRating } from '../../components/ui/star-rating';
export { SwipeToConfirm } from '../../components/ui/swipe-to-confirm';
export { Tag } from '../../components/ui/tag';
export { ToggleSwitch } from '../../components/ui/toggle-switch';

// Badges & indicators
export { AchievementBadge } from '../../components/achievement-badge';
export { AchievementGridCard } from '../../components/achievement-grid-card';
export { EditedBadge } from '../../components/edited-badge';
export { LikeButton } from '../../components/like-button';
export { OfflineBanner } from '../../components/offline-banner';

// Search
export { SearchInput } from '../../components/search-input';
export { MediaTypeToggle } from '../../components/media-type-toggle';
export { SearchTypeToggle } from '../../components/search-type-toggle';
export { MovieSearchCard } from '../../components/movie-search-card';
export { TvShowSearchCard } from '../../components/tv-show-search-card';
export { TicketMovieSearchResult } from '../../components/ticket-movie-search-result';

// Cards
export { CollectionGridCard } from '../../components/cards/collection-grid-card';
export { ContinueWatchingCard } from '../../components/cards/continue-watching-card';
export { FeedItemCard } from '../../components/cards/feed-item-card';
export { FirstTakeCard } from '../../components/cards/first-take-card';
export { ListCard } from '../../components/cards/list-card';
export { ReviewCard } from '../../components/cards/review-card';
export { SearchResultCard } from '../../components/cards/search-result-card';
export { TrendingCard } from '../../components/cards/trending-card';

// Brand heroes
export { TicketReviewCard } from '../../components/ticket-review-card';
export { TicketFlipCard } from '../../components/journey/ticket-flip-card';
// StreakPunchCard deliberately excluded: zero-prop self-fetching container gated
// on a PostHog flag — renders null in every static state (wave-cards 2026-08-03).

// Skeletons
export { ProfileIdentitySkeleton } from '../../components/profile-header-skeleton';
export { SearchSkeletonList } from '../../components/search-skeleton';
