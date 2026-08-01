import '../setup';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * The public web page for a shared take (pocketstubs.com/first-take/{id}) is
 * the one first-take surface no list filter can guard: it is reached by URL.
 * A rating-only take must resolve to the same neutral "unavailable" state as a
 * private or deleted one — the copy deliberately doesn't say which, so the page
 * never advertises that a wordless take exists behind that link.
 *
 * This renders the real screen against a mocked row, so it covers the gate and
 * the branch it guards, not just the predicate.
 */

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'take-1' }),
  Stack: { Screen: () => null },
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('@/components/share/get-pocketstubs-cta', () => ({
  GetPocketStubsCTA: () => null,
}));

// The share card reaches avatar-service → expo-file-system for the avatar URL.
jest.mock('@/lib/avatar-service', () => ({
  buildAvatarUrl: () => null,
}));

import { supabase } from '@/lib/supabase';
import { mockSupabaseQuery } from '@/__tests__/fixtures';
import FirstTakeWebFallback from '@/app/first-take/[id].web';

const WORDED = 'Still thinking about that last shot';

function takeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'take-1',
    user_id: 'u1',
    tmdb_id: 100,
    movie_title: 'Movie A',
    poster_path: '/a.jpg',
    rating: 9,
    reaction_emoji: null,
    quote_text: WORDED,
    visibility: 'public',
    is_rewatch: false,
    created_at: '2026-07-31T12:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FirstTakeWebFallback />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shared first-take web page', () => {
  it('renders a public take that has words', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow(), error: null })
    );

    const { queryByText } = renderPage();

    // Regex, not an exact string: the card wraps the quote in typographic
    // quote marks, so the rendered node is `“…”`.
    await waitFor(() => expect(queryByText(new RegExp(WORDED))).not.toBeNull());
    expect(queryByText('Movie A')).not.toBeNull();
    expect(queryByText("This First Take isn't available")).toBeNull();
  });

  it('shows the neutral unavailable state for a rating-only take', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '' }), error: null })
    );

    const { queryByText } = renderPage();

    await waitFor(() =>
      expect(queryByText("This First Take isn't available")).not.toBeNull()
    );
    // The movie title is part of the take card — nothing about the take leaks.
    expect(queryByText('Movie A')).toBeNull();
  });

  it('treats whitespace-only text as wordless', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockSupabaseQuery({ data: takeRow({ quote_text: '   \n ' }), error: null })
    );

    const { queryByText } = renderPage();

    await waitFor(() =>
      expect(queryByText("This First Take isn't available")).not.toBeNull()
    );
  });
});
