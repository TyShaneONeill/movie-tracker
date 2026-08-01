import '../setup';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * The native first-take detail screen is where the most consequential design
 * call in this change lives: a wordless (rating-only) take is unavailable to
 * everyone EXCEPT its author, who still gets the full view. That asymmetry is
 * what keeps the rule from being a dead end — it's the owner's route back to a
 * take they can still add words to — so it gets pinned by tests rather than
 * inferred from the web page's behaviour.
 */

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'take-1' }),
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

// Chrome that has nothing to do with the visibility gate.
jest.mock('react-native-view-shot', () => 'ViewShot');
jest.mock('@/components/like-button', () => ({ LikeButton: () => null }));
jest.mock('@/components/comments/comment-thread', () => ({ CommentThread: () => null }));
jest.mock('@/components/first-take-modal', () => ({ FirstTakeModal: () => null }));
jest.mock('@/components/share/shareable-first-take-card', () => ({
  ShareableFirstTakeCard: () => null,
}));
jest.mock('@/lib/share-service', () => ({
  captureCard: jest.fn(),
  shareFirstTake: jest.fn(),
  shareFirstTakeUrl: jest.fn(),
}));
jest.mock('@/lib/first-take-service', () => ({
  updateFirstTake: jest.fn(),
  deleteFirstTake: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
jest.mock('@/hooks/use-social-editing', () => ({ useSocialEditingEnabled: () => false }));

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { mockSupabaseQuery } from '@/__tests__/fixtures';
import FirstTakeDetailScreen from '@/app/first-take/[id]';

const WORDED = 'Still thinking about that last shot';
const UNAVAILABLE = "This First Take isn't available";

function takeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'take-1',
    user_id: 'author-1',
    tmdb_id: 100,
    movie_title: 'Movie A',
    poster_path: '/a.jpg',
    rating: 9,
    reaction_emoji: null,
    quote_text: WORDED,
    is_spoiler: false,
    visibility: 'public',
    is_rewatch: false,
    created_at: '2026-07-31T12:00:00Z',
    edited_at: null,
    comment_count: 0,
    like_count: 0,
    media_type: 'movie',
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FirstTakeDetailScreen />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'viewer-1' }, isLoading: false });
});

describe('first-take detail — non-owner', () => {
  it('renders a worded take normally', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow(), error: null })
    );

    const { queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(new RegExp(WORDED))).not.toBeNull());
    expect(queryByText(UNAVAILABLE)).toBeNull();
  });

  it('gets the neutral unavailable state for a rating-only take', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '' }), error: null })
    );

    const { queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(UNAVAILABLE)).not.toBeNull());
    // Nothing about the take leaks — not even which title it was on.
    expect(queryByText('Movie A')).toBeNull();
  });

  it('treats whitespace-only text as wordless', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '   ' }), error: null })
    );

    const { queryByText } = renderScreen();

    await waitFor(() => expect(queryByText(UNAVAILABLE)).not.toBeNull());
  });
});

describe('first-take detail — owner', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'author-1' }, isLoading: false });
  });

  it('still reaches their OWN wordless take — this is the route back to it', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '' }), error: null })
    );

    const { queryByText } = renderScreen();

    // Full view, not the gate: the title renders and the unavailable copy doesn't.
    await waitFor(() => expect(queryByText('Movie A')).not.toBeNull());
    expect(queryByText(UNAVAILABLE)).toBeNull();
  });

  it('does not flash the unavailable state while auth is still resolving', async () => {
    // Mid-resolution: no user yet, so `isOwn` is false. Gating on that alone
    // would show an owner the non-owner state for a frame.
    (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: true });
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '' }), error: null })
    );

    const { queryByText } = renderScreen();

    await waitFor(() => expect(supabase.from).toHaveBeenCalled());
    expect(queryByText(UNAVAILABLE)).toBeNull();
  });
});
