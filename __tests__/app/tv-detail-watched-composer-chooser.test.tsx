/**
 * N3: "First Take or Review?" chooser at the two TV-show-detail "mark
 * watched" transitions (app/tv/[id]/index.tsx handleStatusChange for a
 * direct status change, and handleWatchedConfirm for the batch
 * episode-selection completion path).
 *
 * No coverage existed for the auto-open-First-Take trigger conditions before
 * this file — these tests cover the chooser's flag gate, both routing
 * outcomes, and that flag-OFF is byte-identical to the legacy behavior, at
 * BOTH sites.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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

jest.mock('@/lib/share-service', () => ({
  shareTvDiscovery: jest.fn(),
}));

jest.mock('@/lib/metadata-refresh', () => ({
  refreshSingleShow: jest.fn().mockResolvedValue(false),
}));

const mockAddTvShowToLibrary = jest.fn();
const mockBatchMarkEpisodesWatched = jest.fn().mockResolvedValue(undefined);
const mockUpdateTvShowStatus = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/tv-show-service', () => ({
  addTvShowToLibrary: (...args: unknown[]) => mockAddTvShowToLibrary(...args),
  batchMarkEpisodesWatched: (...args: unknown[]) => mockBatchMarkEpisodesWatched(...args),
  updateTvShowStatus: (...args: unknown[]) => mockUpdateTvShowStatus(...args),
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
  useLocalSearchParams: () => ({ id: '1396' }),
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
jest.mock('@/components/modals/add-to-list-modal', () => ({ AddToListModal: () => null }));
jest.mock('@/components/modals/create-list-modal', () => ({ CreateListModal: () => null }));
jest.mock('@/components/movie-detail/community-reviews', () => ({ CommunityReviews: () => null }));
jest.mock('@/components/share/discovery-tv-card', () => ({ DiscoveryTvCard: () => null }));
jest.mock('@/components/share/get-pocketstubs-cta', () => ({ GetPocketStubsCTA: () => null }));

jest.mock('@/hooks/use-episode-rooms-enabled', () => ({
  useEpisodeRoomsEnabled: () => false,
}));

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

// The batch episode-selection modal — stubbed to a single button that invokes
// the real onConfirm with a canned "series complete" result, so the test
// exercises the real handleWatchedConfirm logic without simulating the full
// per-episode selection UI.
jest.mock('@/components/tv/tv-watched-selection-modal', () => {
  const { Pressable, Text } = require('react-native');
  return {
    TvWatchedSelectionModal: ({ visible, onConfirm }: { visible: boolean; onConfirm: (r: unknown) => Promise<void> }) =>
      visible ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onConfirm({
              fullySelectedSeasons: [{ seasonNumber: 1, episodes: [] }],
              partialSeasons: [],
              totalEpisodesSelected: 5,
              isComplete: true,
            })
          }
        >
          <Text>Confirm Batch</Text>
        </Pressable>
      ) : null,
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

jest.mock('@/hooks/use-social-editing', () => ({
  useSocialEditingEnabled: () => true,
}));

const mockChangeStatus = jest.fn().mockResolvedValue(undefined);
// episodes_watched / number_of_episodes are mutated per test to route
// "Watched" presses either straight through handleStatusChange (total = 0,
// no batch intercept) or into the batch selection modal (total >
// episodes_watched).
const mockUserTvShow: { id: string; episodes_watched: number } = { id: 'tv-1', episodes_watched: 0 };
jest.mock('@/hooks/use-tv-show-actions', () => ({
  useTvShowActions: () => ({
    userTvShow: mockUserTvShow,
    isSaved: true,
    currentStatus: 'watching',
    isLiked: false,
    isSaving: false,
    isTogglingLike: false,
    addToLibrary: jest.fn().mockResolvedValue(undefined),
    removeFromLibrary: jest.fn().mockResolvedValue(undefined),
    changeStatus: mockChangeStatus,
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

const mockShow: { id: number; name: string; number_of_episodes: number } = {
  id: 1396,
  name: 'Breaking Bad',
  number_of_episodes: 0,
};
jest.mock('@/hooks/use-tv-show-detail', () => ({
  useTvShowDetail: () => ({
    show: {
      id: mockShow.id,
      name: mockShow.name,
      overview: '',
      poster_path: null,
      backdrop_path: null,
      first_air_date: '2008-01-20',
      last_air_date: '2013-09-29',
      in_production: false,
      vote_average: 9.5,
      vote_count: 100,
      genre_ids: [],
      genres: [],
      origin_country: ['US'],
      original_language: 'en',
      number_of_seasons: 1,
      number_of_episodes: mockShow.number_of_episodes,
      networks: [],
      created_by: [],
    },
    cast: [],
    crew: [],
    trailer: null,
    watchProviders: {},
    seasons: [],
    recommendations: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// The chooser's own flag gate — flipped per test.
const mockUseWatchedComposerChooserEnabled = jest.fn();
jest.mock('@/hooks/use-feature-flag', () => ({
  useWatchedComposerChooserEnabled: () => mockUseWatchedComposerChooserEnabled(),
}));

import TvShowDetailScreen from '@/app/tv/[id]/index';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TvShowDetailScreen />
    </QueryClientProvider>
  );
}

async function pressWatched(getByLabelText: (label: RegExp | string) => any) {
  // handleStatusChange is async with several sequential `await`s before it
  // sets chooser/modal state — act(async) drains those microtasks so the
  // eventual setState isn't left dangling outside an act() batch.
  await act(async () => {
    fireEvent.press(getByLabelText(/^Watched,/i));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockChangeStatus.mockResolvedValue(undefined);
  mockBatchMarkEpisodesWatched.mockResolvedValue(undefined);
  mockUpdateTvShowStatus.mockResolvedValue(undefined);
  mockFirstTakePromptEnabled = true;
  mockUserTvShow.episodes_watched = 0;
  mockShow.number_of_episodes = 0;
});

describe('tv detail: N3 watched-composer chooser — direct status change (handleStatusChange)', () => {
  // number_of_episodes = 0 means the batch-selection intercept never fires,
  // so pressing "Watched" goes straight through handleStatusChange.

  it('flag ON: marking watched opens the chooser instead of the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, findByText, getByText } = renderScreen();

    await pressWatched(getByLabelText);

    expect(await findByText('Share Your Take')).toBeTruthy();
    expect(getByText('First Take')).toBeTruthy();
  });

  it('flag ON: choosing First Take opens the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, findByText, getByTestId } = renderScreen();

    await pressWatched(getByLabelText);
    fireEvent.press(await findByText('First Take'));

    expect(getByTestId('first-take-modal-state').props.children).toBe('open');
    expect(getByTestId('review-modal-state').props.children).toBe('closed');
  });

  it('flag ON: choosing Review opens the Review composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const { getByLabelText, findByText, getByTestId } = renderScreen();

    await pressWatched(getByLabelText);
    // Press via the chooser row's description text — "Review" alone is
    // ambiguous with the (unrelated) action-grid Review button.
    fireEvent.press(await findByText('A fuller take — share it only if you choose'));

    expect(getByTestId('review-modal-state').props.children).toBe('open');
    expect(getByTestId('first-take-modal-state').props.children).toBe('closed');
  });

  it('flag OFF: marking watched auto-opens the First Take composer directly (legacy, byte-identical)', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(false);
    const { getByLabelText, getByTestId, queryByText } = renderScreen();

    await pressWatched(getByLabelText);
    await waitFor(() => expect(getByTestId('first-take-modal-state').props.children).toBe('open'));

    expect(queryByText('Share Your Take')).toBeNull();
  });

  it('firstTakePromptEnabled=false suppresses the chooser even when the flag is ON', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    mockFirstTakePromptEnabled = false;
    const { getByLabelText, getByTestId, queryByText } = renderScreen();

    await pressWatched(getByLabelText);
    await waitFor(() => expect(mockChangeStatus).toHaveBeenCalledWith('watched'));

    expect(getByTestId('first-take-modal-state').props.children).toBe('closed');
    expect(getByTestId('review-modal-state').props.children).toBe('closed');
    expect(queryByText('Share Your Take')).toBeNull();
  });
});

describe('tv detail: N3 watched-composer chooser — batch completion (handleWatchedConfirm)', () => {
  beforeEach(() => {
    // total > watched routes "Watched" into the batch selection modal instead
    // of straight through handleStatusChange.
    mockUserTvShow.episodes_watched = 5;
    mockShow.number_of_episodes = 10;
  });

  async function pressWatchedThenConfirmBatch(screen: ReturnType<typeof renderScreen>) {
    fireEvent.press(screen.getByLabelText(/^Watched,/i));
    const confirmButton = await screen.findByText('Confirm Batch');
    fireEvent.press(confirmButton);
    await waitFor(() => expect(mockUpdateTvShowStatus).toHaveBeenCalled());
  }

  it('flag ON: completing the batch opens the chooser instead of the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const screen = renderScreen();

    await pressWatchedThenConfirmBatch(screen);

    expect(screen.getByText('Share Your Take')).toBeTruthy();
    expect(screen.getByTestId('first-take-modal-state').props.children).toBe('closed');
  });

  it('flag ON: choosing First Take opens the First Take composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const screen = renderScreen();

    await pressWatchedThenConfirmBatch(screen);
    fireEvent.press(screen.getByText('First Take'));

    expect(screen.getByTestId('first-take-modal-state').props.children).toBe('open');
    expect(screen.getByTestId('review-modal-state').props.children).toBe('closed');
  });

  it('flag ON: choosing Review opens the Review composer', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    const screen = renderScreen();

    await pressWatchedThenConfirmBatch(screen);
    fireEvent.press(screen.getByText('A fuller take — share it only if you choose'));

    expect(screen.getByTestId('review-modal-state').props.children).toBe('open');
    expect(screen.getByTestId('first-take-modal-state').props.children).toBe('closed');
  });

  it('flag OFF: completing the batch auto-opens the First Take composer directly (legacy, byte-identical)', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(false);
    const screen = renderScreen();

    await pressWatchedThenConfirmBatch(screen);

    expect(screen.getByTestId('first-take-modal-state').props.children).toBe('open');
    expect(screen.queryByText('Share Your Take')).toBeNull();
  });

  it('firstTakePromptEnabled=false suppresses the chooser even when the flag is ON', async () => {
    mockUseWatchedComposerChooserEnabled.mockReturnValue(true);
    mockFirstTakePromptEnabled = false;
    const screen = renderScreen();

    await pressWatchedThenConfirmBatch(screen);

    expect(screen.getByTestId('first-take-modal-state').props.children).toBe('closed');
    expect(screen.getByTestId('review-modal-state').props.children).toBe('closed');
    expect(screen.queryByText('Share Your Take')).toBeNull();
  });
});
