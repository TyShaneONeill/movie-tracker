import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import React from 'react';

// Pins the fix for PR-FG item G (bridge strip crowding the "N OF M" counter):
// 1) the bridge strip wrapper keeps a fixed bottom offset that clears the
//    counter (Spacing.xxl + Spacing.md, not just Spacing.xxl), and
// 2) the strip's subtitle is capped to one line so a wrap can never eat the
//    clearance back up. Neither should regress silently.

import { InkTakeBridgeStrip } from '@/components/tvtime-deck/ink-take-bridge-strip';
import { TvTimeDeckScreen } from '@/components/tvtime-deck/deck-screen';
import { Spacing } from '@/constants/theme';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

// @expo/vector-icons pulls in expo-asset which isn't transformed under jest.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ effectiveTheme: 'dark' }) }));
jest.mock('@/lib/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

const item: DeckItem = {
  key: 'movie:1',
  target: { mediaType: 'movie', tmdbId: 1 },
  title: 'Test Movie',
  year: '2020',
  posterPath: null,
};

describe('InkTakeBridgeStrip subtitle', () => {
  it('caps the subtitle to one line so a wrap cannot erase the clearance under the counter', () => {
    const { getByText } = render(
      <InkTakeBridgeStrip item={item} reduced onTap={jest.fn()} onDismiss={jest.fn()} />
    );

    const subtitle = getByText('Turn your ink into a First Take');
    expect(subtitle.props.numberOfLines).toBe(1);
  });
});

// --- Full-screen clearance test -------------------------------------------
// Drives the real deck screen to the state where the bridge strip is showing
// alongside the "N OF M" counter, and pins the strip wrapper's bottom offset.

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/components/onboarding/v2/shared/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/hooks/use-user-preferences', () => ({ useUserPreferences: () => ({ preferences: null }) }));
jest.mock('@/lib/tvtime-deck/deck-service', () => ({ inkStubRating: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/tvtime-deck/skip-store', () => ({
  addSkipped: jest.fn(),
  clearSkipped: jest.fn(),
  getSkipped: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/first-take-service', () => ({ createFirstTake: jest.fn() }));
jest.mock('@/lib/tmdb.types', () => ({ getTMDBImageUrl: () => null }));
jest.mock('@/components/first-take-modal', () => {
  const { View } = require('react-native');
  return { FirstTakeModal: () => <View testID="first-take-modal" /> };
});

const mockRateTop = jest.fn();
jest.mock('@/components/tvtime-deck/deck-card', () => {
  const { Pressable, Text } = require('react-native');
  return {
    DeckCard: ({ item: cardItem, onRate }: { item: DeckItem; onRate: (i: DeckItem, r: number) => void }) => {
      mockRateTop.mockImplementation(() => onRate(cardItem, 8));
      return (
        <Pressable testID="rate-top" onPress={mockRateTop}>
          <Text>{cardItem.title}</Text>
        </Pressable>
      );
    },
  };
});

jest.mock('@/hooks/use-tvtime-deck', () => ({
  useTvTimeDeck: () => ({
    isLoading: false,
    isError: false,
    data: {
      eligible: [
        { key: 'movie:1', target: { mediaType: 'movie', tmdbId: 1 }, title: 'Test Movie', year: '2020', posterPath: null },
        { key: 'movie:2', target: { mediaType: 'movie', tmdbId: 2 }, title: 'Second Movie', year: '2021', posterPath: null },
      ],
      progress: { totalEligible: 2, inked: 0 },
      existingTakeKeys: new Set<string>(),
      skippedKeys: new Set<string>(),
    },
    refetch: jest.fn(),
  }),
}));

describe('TvTimeDeckScreen bridge strip clearance', () => {
  it('offsets the bridge strip wrapper by Spacing.xxl + Spacing.md so it clears the "N OF M" counter', async () => {
    const { findByTestId, findByText } = render(<TvTimeDeckScreen />);

    // Rate the top card so a second item remains — the deck stays visible (not
    // the "done" screen) and the bridge strip mounts alongside the counter.
    const rateButton = await findByTestId('rate-top');
    fireEvent.press(rateButton);

    const bridgeText = await findByText('Say a line about Test Movie');
    // Walk up from the strip's inner text to the absolutely-positioned wrapper.
    let node = bridgeText.parent;
    while (node && !StyleSheet.flatten(node.props.style)?.position) {
      node = node.parent;
    }
    expect(node).toBeTruthy();
    expect(StyleSheet.flatten(node!.props.style).bottom).toBe(Spacing.xxl + Spacing.md);

    // Sanity: the counter this offset exists to clear is also on screen (position
    // advances to the next card once the top one is rated and removed).
    await findByText('2 OF 2');
  });
});
