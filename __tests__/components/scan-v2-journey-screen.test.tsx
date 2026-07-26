import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { JourneyScreenV2 } from '@/components/scan-v2/journey-screen';
import { useJourneysByMovie, useJourneyMutations, useCreateJourney } from '@/hooks/use-journey';
import type { UserMovie } from '@/lib/database.types';

// The ticket card itself isn't exercised by this test (only the tappable
// header title is) — stub it out to avoid pulling in SignedPhoto (expo-image)
// and the avatar-stack chain.
jest.mock('@/components/scan-v2/journey-card', () => ({
  JourneyCard: () => null,
  JOURNEY_STUB_MIN_HEIGHT: 158,
  JOURNEY_POSTER_ASPECT: 1.5,
}));

jest.mock('@/components/scan-v2/edit-journey-sheet', () => ({
  EditJourneySheet: () => null,
}));

jest.mock('@/components/scan-v2/generate-art-sheet', () => ({
  GenerateArtSheet: () => null,
}));

jest.mock('@/components/poster-inspection', () => ({
  PosterInspectionModal: () => null,
}));

jest.mock('@/components/premium/upgrade-prompt-sheet', () => ({
  UpgradePromptSheet: () => null,
}));

jest.mock('@/components/modals/login-prompt-modal', () => ({
  LoginPromptModal: () => null,
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({ tmdbId: '550' })),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(() => ({ user: null })),
}));

jest.mock('@/hooks/use-mutual-follows', () => ({
  useMutualFollows: jest.fn(() => ({ mutualFollows: [] })),
}));

jest.mock('@/hooks/use-require-auth', () => ({
  useRequireAuth: jest.fn(() => ({
    requireAuth: (fn: () => void) => fn(),
    isLoginPromptVisible: false,
    loginPromptMessage: '',
    hideLoginPrompt: jest.fn(),
  })),
}));

jest.mock('@/hooks/use-journey', () => ({
  useJourneysByMovie: jest.fn(),
  useJourneyMutations: jest.fn(),
  useCreateJourney: jest.fn(),
}));

// Prevent the real Supabase client (auth-js auto-refresh timer, AsyncStorage
// session load) from spinning up — the scannedIds query is disabled in these
// tests (no signed-in user), so `.from()` is never actually called.
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/lib/avatar-service', () => ({
  buildAvatarUrl: jest.fn(() => null),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const mockUseRouter = useRouter as jest.Mock;
const mockUseJourneysByMovie = useJourneysByMovie as jest.Mock;
const mockUseJourneyMutations = useJourneyMutations as jest.Mock;
const mockUseCreateJourney = useCreateJourney as jest.Mock;

const TMDB_ID = 550;

function makeJourney(overrides: Partial<UserMovie> = {}): UserMovie {
  return {
    id: 'journey-1',
    user_id: 'user-1',
    tmdb_id: TMDB_ID,
    title: 'Fight Club',
    status: 'watched',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: 'A movie',
    release_date: '1999-10-15',
    vote_average: 8.4,
    genre_ids: [18],
    added_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    watched_at: '2024-01-01T00:00:00Z',
    is_liked: null,
    ticket_id: null,
    ticket_price: null,
    watch_format: null,
    watch_time: null,
    watched_with: null,
    seat_location: null,
    location_name: null,
    location_type: null,
    auditorium: null,
    journey_notes: null,
    journey_tagline: null,
    journey_photos: null,
    journey_number: 1,
    journey_created_at: '2024-01-01T00:00:00Z',
    journey_updated_at: '2024-01-01T00:00:00Z',
    cover_photo_index: null,
    ai_poster_url: null,
    ai_poster_rarity: null,
    display_poster: null,
    ...overrides,
  } as UserMovie;
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <JourneyScreenV2 />
    </QueryClientProvider>
  );
}

describe('JourneyScreenV2 — tappable header title', () => {
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ push, back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) });
    mockUseJourneysByMovie.mockReturnValue({
      data: { journeys: [makeJourney()], firstTake: null },
      isLoading: false,
      isError: false,
    });
    mockUseJourneyMutations.mockReturnValue({ updateJourney: jest.fn(), deleteJourney: jest.fn() });
    mockUseCreateJourney.mockReturnValue({ createJourney: jest.fn(), isCreating: false });
  });

  it('navigates to the movie details screen when the title is tapped', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Fight Club'));

    expect(push).toHaveBeenCalledWith(`/movie/${TMDB_ID}`);
  });

  it('exposes the title as an accessible button', () => {
    const { getByRole } = renderScreen();

    expect(getByRole('button', { name: `View details for Fight Club` })).toBeTruthy();
  });

  it('keeps single-line truncation and caps the tappable area for a long title', () => {
    // Regression guard: the tappable wrapper sits between the flex:1/minWidth:0
    // header container and the title text. Without an explicit maxWidth on the
    // Pressable, a long title can overflow instead of ellipsizing.
    const LONG_TITLE = 'The Lord of the Rings: The Fellowship of the Ring';
    mockUseJourneysByMovie.mockReturnValue({
      data: { journeys: [makeJourney({ title: LONG_TITLE })], firstTake: null },
      isLoading: false,
      isError: false,
    });

    const { getByText, getByRole } = renderScreen();

    const titleText = getByText(LONG_TITLE);
    expect(titleText.props.numberOfLines).toBe(1);

    const titleButton = getByRole('button', { name: `View details for ${LONG_TITLE}` });
    expect(titleButton.props.style).toMatchObject({ maxWidth: '100%' });
    // hitSlop widens the tap target without affecting layout — pin it so it
    // can't be silently dropped (or "tidied" into padding) alongside maxWidth.
    expect(titleButton.props.hitSlop).toEqual({ top: 12, bottom: 12 });
  });
});
