/**
 * N3: "First Take or Review?" chooser at the movie-detail "mark watched"
 * transition (app/movie/[id]/index.tsx handleStatusChange).
 *
 * No coverage existed for the auto-open-First-Take trigger conditions before
 * this file — these tests cover the chooser's flag gate, both routing
 * outcomes, and that flag-OFF is byte-identical to the legacy behavior.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — native/heavy deps that aren't exercised by this test
// ---------------------------------------------------------------------------
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US' }],
}));

jest.mock('react-native-view-shot', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// The real client would spin up GoTrue auto-refresh timers on import.
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

// Pulls in expo-sharing, which isn't transformable in this jest config; the
// Share action isn't exercised by this test.
jest.mock('@/lib/share-service', () => ({
  shareMovieDiscovery: jest.fn(),
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
    getFeatureFlag: jest.fn(),
    reloadFeatureFlags: jest.fn(),
  },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '603' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    SafeAreaView: View,
  };
});

// Screens under test render several presentational sections not relevant to
// the chooser trigger — stub them out to keep the render surface small.
jest.mock('@/components/ui/glass-back-button', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});
jest.mock('@/components/modals/trailer-modal', () => ({ TrailerModal: () => null }));
jest.mock('@/components/modals/login-prompt-modal', () => ({ LoginPromptModal: () => null }));
jest.mock('@/components/modals/confirmation-modal', () => ({ ConfirmationModal: () => null }));
jest.mock('@/components/modals/add-to-list-modal', () => ({ AddToListModal: () => null }));
jest.mock('@/components/modals/create-list-modal', () => ({ CreateListModal: () => null }));
jest.mock('@/components/movie-detail/external-ratings', () => ({ ExternalRatings: () => null }));
jest.mock('@/components/movie-detail/friends-ratings', () => ({ FriendsRatings: () => null }));
jest.mock('@/components/movie-detail/community-reviews', () => ({ CommunityReviews: () => null }));
jest.mock('@/components/share/discovery-movie-card', () => ({ DiscoveryMovieCard: () => null }));
jest.mock('@/components/share/get-pocketstubs-cta', () => ({ GetPocketStubsCTA: () => null }));

// The two composers this test routes between — stubbed to report their
// `visible` prop so we can assert which one opened without re-testing their
// internals (already covered by their own test suites).
jest.mock('@/components/first-take-modal', () => {
  const { Text } = require('react-native');
  return {
    FirstTakeModal: ({ visible }: { visible: boolean }) => (
      <Text testID="first-take-modal-state">{visible ? 'open' : 'closed'}</Text>
    ),
  };
});
jest.mock('@/components/review-modal', () => {
  const { Text } = require('react-native');
  return {
    ReviewModal: ({ visible }: { visible: boolean }) => (
      <Text testID="review-modal-state">{visible ? 'open' : 'closed'}</Text>
    ),
  };
});

// ---------------------------------------------------------------------------
// Data-layer hook mocks
// ---------------------------------------------------------------------------
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/use-require-auth', () => ({
  useRequireAuth: () => ({
    requireAuth: (fn: () => void) => fn(),
    isLoginPromptVisible: false,
    loginPromptMessage: '',
    hideLoginPrompt: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-user-lists', () => ({
  useUserLists: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-ticket-verification', () => ({
  useTicketVerification: () => ({ hasVerifiedTicket: false, isLoading: false }),
}));

jest.mock('@/hooks/use-social-editing', () => ({
  useSocialEditingEnabled: () => true,
}));

const mockChangeStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/hooks/use-movie-actions', () => ({
  useMovieActions: () => ({
    userMovie: { id: 'um-1' },
    isSaved: true,
    currentStatus: 'watching',
    isLoadingWatchlist: false,
    isSaving: false,
    isLiked: false,
    isLoadingLike: false,
    isTogglingLike: false,
    addToWatchlist: jest.fn().mockResolvedValue(undefined),
    removeFromWatchlist: jest.fn().mockResolvedValue(undefined),
    changeStatus: mockChangeStatus,
    downgradeStatus: jest.fn().mockResolvedValue(undefined),
    toggleLike: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/hooks/use-first-take-actions', () => ({
  useFirstTakeActions: () => ({
    existingTake: null,
    hasFirstTake: false,
    isLoadingTake: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    createTake: jest.fn(),
    updateTake: jest.fn(),
    deleteTake: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-review-actions', () => ({
  useReviewActions: () => ({
    existingReview: null,
    hasReview: false,
    isLoadingReview: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    createReview: jest.fn(),
    updateReview: jest.fn(),
    deleteReview: jest.fn(),
  }),
}));

// firstTakePromptEnabled — flipped per test.
let mockFirstTakePromptEnabled = true;
jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    preferences: { firstTakePromptEnabled: mockFirstTakePromptEnabled, reviewVisibility: 'public' },
    isLoading: false,
    updatePreference: jest.fn(),
    isUpdating: false,
  }),
}));

jest.mock('@/hooks/use-movie-detail', () => ({
  useMovieDetail: () => ({
    movie: {
      id: 603,
      title: 'The Matrix',
      overview: '',
      poster_path: null,
      backdrop_path: null,
      release_date: '1999-03-31',
      vote_average: 8.7,
      vote_count: 100,
      genre_ids: [],
      runtime: 136,
      genres: [],
    },
    cast: [],
    crew: [],
    trailer: null,
    watchProviders: {},
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  }),
}));

// The chooser's own flag gate — flipped per test.
const mockUseWatchedComposerChooserEnabled = jest.fn();
jest.mock('@/hooks/use-feature-flag', () => ({
  useWatchedComposerChooserEnabled: () => mockUseWatchedComposerChooserEnabled(),
}));

import MovieDetailScreen from '@/app/movie/[id]/index';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MovieDetailScreen />
    </QueryClientProvider>
  );
}

async function pressWatched(getByLabelText: (label: RegExp | string) => any) {
  fireEvent.press(getByLabelText(/^Watched,/i));
  // handleStatusChange is async (awaits changeStatus before the chooser/modal trigger runs)
  await waitFor(() => expect(mockChangeStatus).toHaveBeenCalled());
}

describe('movie detail: N3 watched-composer chooser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChangeStatus.mockResolvedValue(undefined);
    mockFirstTakePromptEnabled = true;
  });

  it('flag ON: marking watched opens the chooser instead of the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, getByText, queryByText, getByTestId } = renderScreen();

    await pressWatched(getByLabelText);

    expect(getByText('Share Your Take')).toBeTruthy();
    expect(getByText('First Take')).toBeTruthy();
    // "Review" also labels the (unrelated) action-grid button, so assert via
    // the chooser option's unique description text instead.
    expect(getByText('A fuller take — share it only if you choose')).toBeTruthy();
    expect(getByTestId('first-take-modal-state').props.children).toBe('closed');
    expect(queryByText('First Take')).toBeTruthy();
  });

  it('flag ON: choosing First Take opens the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, getByText, getByTestId } = renderScreen();

    await pressWatched(getByLabelText);
    fireEvent.press(getByText('First Take'));

    expect(getByTestId('first-take-modal-state').props.children).toBe('open');
    expect(getByTestId('review-modal-state').props.children).toBe('closed');
  });

  it('flag ON: choosing Review opens the Review composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, getByText, getByTestId } = renderScreen();

    await pressWatched(getByLabelText);
    // Press via the chooser row's description text — "Review" alone is
    // ambiguous with the (unrelated) action-grid Review button.
    fireEvent.press(getByText('A fuller take — share it only if you choose'));

    expect(getByTestId('review-modal-state').props.children).toBe('open');
    expect(getByTestId('first-take-modal-state').props.children).toBe('closed');
  });

  it('flag OFF: marking watched auto-opens the First Take composer directly (legacy, byte-identical)', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(false);
    const { getByLabelText, getByTestId, queryByText } = renderScreen();

    await pressWatched(getByLabelText);

    expect(getByTestId('first-take-modal-state').props.children).toBe('open');
    // No chooser sheet in the tree at all.
    expect(queryByText('Share Your Take')).toBeNull();
  });

  it('firstTakePromptEnabled=false suppresses the chooser even when the flag is ON', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    mockFirstTakePromptEnabled = false;
    const { getByLabelText, getByTestId, queryByText } = renderScreen();

    await pressWatched(getByLabelText);

    expect(getByTestId('first-take-modal-state').props.children).toBe('closed');
    expect(getByTestId('review-modal-state').props.children).toBe('closed');
    expect(queryByText('Share Your Take')).toBeNull();
  });
});
