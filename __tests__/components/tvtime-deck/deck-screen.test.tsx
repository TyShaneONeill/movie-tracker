import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TvTimeDeckScreen } from '@/components/tvtime-deck/deck-screen';
import { useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import { inkStubRating } from '@/lib/tvtime-deck/deck-service';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

jest.mock('@/components/onboarding/v2/shared/use-reduced-motion', () => ({
  useReducedMotion: () => false,
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: null, isLoading: false, updatePreference: jest.fn(), isUpdating: false }),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), identify: jest.fn(), reset: jest.fn(), setPersonProperties: jest.fn() },
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@/hooks/use-tvtime-deck', () => ({
  useTvTimeDeck: jest.fn(),
}));

jest.mock('@/lib/tvtime-deck/deck-service', () => ({
  inkStubRating: jest.fn(),
}));

jest.mock('@/lib/tvtime-deck/skip-store', () => ({
  addSkipped: jest.fn(),
  clearSkipped: jest.fn(),
  getSkipped: jest.fn(),
}));

jest.mock('@/lib/first-take-service', () => ({
  createFirstTake: jest.fn(),
}));

// Keep the deck screen's children as thin stubs — this suite only exercises
// handleRate's cache-invalidation + counter behavior, not card rendering.
jest.mock('@/components/tvtime-deck/deck-card', () => {
  const { Pressable, Text } = require('react-native');
  return {
    DeckCard: ({ item, onRate }: { item: DeckItem; onRate: (item: DeckItem, rating: number) => void }) => (
      <Pressable testID={`rate-${item.key}`} onPress={() => onRate(item, 8)}>
        <Text>{item.title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('@/components/tvtime-deck/ink-take-bridge-strip', () => ({ InkTakeBridgeStrip: () => null }));
jest.mock('@/components/first-take-modal', () => ({ FirstTakeModal: () => null }));

const mockUseDeck = useTvTimeDeck as jest.Mock;
const mockInkStubRating = inkStubRating as jest.Mock;

const item = (key: string, tmdbId: number): DeckItem => ({
  key,
  target: { mediaType: 'movie', tmdbId },
  title: `Movie ${tmdbId}`,
  year: '2020',
  posterPath: null,
});

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  const utils = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  // Exposed so a test can simulate an invalidated refetch landing: swap the
  // useTvTimeDeck mock's return value, then rerender through the SAME
  // provider/client so the screen's local state (e.g. sessionInkedKeys)
  // survives, just like a real re-render off a fresh query result would.
  const rerenderWithClient = (nextUi: React.ReactElement) =>
    utils.rerender(<QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>);
  return { ...utils, invalidateSpy, rerenderWithClient };
}

describe('TvTimeDeckScreen — handleRate cache invalidation + counter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates the tvtimeDeck query for this user after a successful ink', async () => {
    mockInkStubRating.mockResolvedValue(undefined);
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:1', 1), item('movie:2', 2)],
        skippedKeys: new Set<string>(),
        progress: { inked: 0, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { findByTestId, invalidateSpy } = renderWithClient(<TvTimeDeckScreen />);

    const rateBtn = await findByTestId('rate-movie:1');
    await act(async () => {
      fireEvent.press(rateBtn);
    });

    await waitFor(() => expect(mockInkStubRating).toHaveBeenCalledWith('user-1', expect.objectContaining({ key: 'movie:1' }), 8));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tvtimeDeck', 'user-1'] })
    );
  });

  it('does NOT invalidate when the write fails', async () => {
    mockInkStubRating.mockRejectedValue(new Error('network down'));
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:1', 1)],
        skippedKeys: new Set<string>(),
        progress: { inked: 0, totalEligible: 1 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { findByTestId, invalidateSpy } = renderWithClient(<TvTimeDeckScreen />);

    const rateBtn = await findByTestId('rate-movie:1');
    await act(async () => {
      fireEvent.press(rateBtn);
    });

    await waitFor(() => expect(mockInkStubRating).toHaveBeenCalled());
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['tvtimeDeck', 'user-1'] });
  });

  it('inking one of two stubs shows "1 of 2 inked" and stays there once the invalidated refetch lands (device regression: was reading "2 of 2" with a stub still unrated)', async () => {
    mockInkStubRating.mockResolvedValue(undefined);
    const initialData = {
      eligible: [item('movie:1', 1), item('movie:2', 2)],
      skippedKeys: new Set<string>(),
      progress: { inked: 0, totalEligible: 2 },
      existingTakeKeys: new Set<string>(),
    };
    mockUseDeck.mockReturnValue({ isLoading: false, isError: false, data: initialData, refetch: jest.fn() });

    const { findByTestId, findByText, queryByText, rerenderWithClient } = renderWithClient(
      <TvTimeDeckScreen />
    );

    // Ink movie:1 (Harry Potter). Server hasn't confirmed anything yet.
    const rateBtn = await findByTestId('rate-movie:1');
    await act(async () => {
      fireEvent.press(rateBtn);
    });
    await waitFor(() => expect(mockInkStubRating).toHaveBeenCalled());
    expect(await findByText('1 of 2 inked')).toBeTruthy();

    // Simulate the invalidated refetch landing: the server now confirms
    // movie:1 as inked (progress.inked: 1) and drops it from eligible — this
    // is exactly the moment the old sum-based formula double-counted it
    // (baseInked=1 + sessionInkedKeys.size=1 = 2 of 2, prematurely "done").
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:2', 2)],
        skippedKeys: new Set<string>(),
        progress: { inked: 1, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });
    rerenderWithClient(<TvTimeDeckScreen />);

    // Must still read "1 of 2" — movie:2 (Joker) is genuinely still unrated.
    expect(queryByText('2 of 2 inked')).toBeNull();
    expect(await findByText('1 of 2 inked')).toBeTruthy();
  });

  it('the displayed "N of M inked" count never exceeds total even for a contrived over-counted mock', async () => {
    mockInkStubRating.mockResolvedValue(undefined);
    // Defensive backstop case: even if baseInked + pending somehow overshot
    // total (shouldn't happen with real query data), the clamp still holds.
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:1', 1)],
        skippedKeys: new Set<string>(),
        progress: { inked: 2, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { findByTestId, findByText, queryByText } = renderWithClient(<TvTimeDeckScreen />);

    const rateBtn = await findByTestId('rate-movie:1');
    await act(async () => {
      fireEvent.press(rateBtn);
    });

    await waitFor(() => expect(mockInkStubRating).toHaveBeenCalled());
    expect(queryByText(/3 of 2/)).toBeNull();
    expect(await findByText('2 of 2 inked')).toBeTruthy();
  });
});
