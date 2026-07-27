import { render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { InkStubsCard } from '@/components/tvtime-deck/ink-stubs-card';
import { useTvTimeImportDeckGate, useTvTimeDeck } from '@/hooks/use-tvtime-deck';
import type { DeckItem } from '@/lib/tvtime-deck/deck-logic';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));

jest.mock('@/hooks/use-tvtime-deck', () => ({
  useTvTimeImportDeckGate: jest.fn(),
  useTvTimeDeck: jest.fn(),
}));

const mockUseGate = useTvTimeImportDeckGate as jest.Mock;
const mockUseDeck = useTvTimeDeck as jest.Mock;
const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

const item = (key: string): DeckItem => ({
  key,
  target: { mediaType: 'movie', tmdbId: 1 },
  title: 'Some Movie',
  year: '2020',
  posterPath: null,
});

describe('InkStubsCard (home "Ink your imported stubs" banner)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGate.mockReturnValue({ enabled: true, resolving: false });
    mockGetItem.mockResolvedValue('false'); // not dismissed
    mockSetItem.mockResolvedValue(undefined);
  });

  it('renders with the inked/total progress while eligible stubs remain', async () => {
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:1')],
        skippedKeys: new Set<string>(),
        progress: { inked: 1, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { findByText } = render(<InkStubsCard />);

    expect(await findByText('Ink your imported stubs')).toBeTruthy();
    expect(await findByText('1 of 2 inked · pick up where you left off')).toBeTruthy();
  });

  // The bug this guards: without cache invalidation after a successful ink,
  // this banner kept showing the pre-ink snapshot forever (stale query cache,
  // 60s staleTime, never invalidated) — re-tapping re-presented the same
  // titles. Once the deck screen invalidates ['tvtimeDeck', userId] after each
  // ink, a re-render here with the refreshed (now-empty) eligible list must
  // clear the banner without an app restart.
  it('clears once no eligible stubs remain (remaining reaches zero)', async () => {
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [],
        skippedKeys: new Set<string>(),
        progress: { inked: 2, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { queryByText } = render(<InkStubsCard />);

    await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
    expect(queryByText('Ink your imported stubs')).toBeNull();
  });

  it('also clears when every eligible item is locally skipped (nothing left to present)', async () => {
    mockUseDeck.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        eligible: [item('movie:1')],
        skippedKeys: new Set<string>(['movie:1']),
        progress: { inked: 1, totalEligible: 2 },
        existingTakeKeys: new Set<string>(),
      },
      refetch: jest.fn(),
    });

    const { queryByText } = render(<InkStubsCard />);

    await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
    expect(queryByText('Ink your imported stubs')).toBeNull();
  });
});
