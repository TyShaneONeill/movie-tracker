import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReleaseCalendarScreen from '@/app/release-calendar';
import { WEEK_SNAP_BASE_HEIGHT } from '@/components/release-calendar-v2/release-calendar-dock';

// Mock @expo/vector-icons — pulls in expo-asset which isn't in transformIgnorePatterns.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

// release-card.tsx (rendered by ReleaseDayList) imports expo-image, which
// pulls in expo-asset — not in transformIgnorePatterns.
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

// TrailerModal is rendered by ReleaseCard but not exercised in these tests;
// stub it out to avoid pulling react-native-youtube-iframe + its WebView deps
// (mirrors __tests__/components/calendar/release-day-list.test.tsx).
jest.mock('@/components/modals/trailer-modal', () => ({
  TrailerModal: () => null,
}));

// LoginPromptModal pulls in expo-haptics — not exercised in these tests
// (isLoginPromptVisible is always false via the use-require-auth mock above).
jest.mock('@/components/modals/login-prompt-modal', () => ({
  LoginPromptModal: () => null,
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

// useSafeAreaInsets() throws without a <SafeAreaProvider> in the tree, which
// this test suite doesn't set up. Mock the module (SafeAreaView passes
// through as a plain View, matching how it already renders in these tests)
// with a fixed inset so the dock-clearance padding assertion is deterministic.
const MOCK_SAFE_AREA_BOTTOM_INSET = 34;
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: MOCK_SAFE_AREA_BOTTOM_INSET, left: 0 }),
  };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@/hooks/use-release-calendar', () => ({
  useReleaseCalendar: jest.fn(() => ({ data: undefined, isLoading: true })),
  useWatchlistIds: jest.fn(() => ({ data: undefined })),
}));

jest.mock('@/hooks/use-taste-profile', () => ({
  useTasteProfile: jest.fn(() => ({ data: undefined })),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: jest.fn(() => ({ user: null })),
}));

jest.mock('@/hooks/use-require-auth', () => ({
  useRequireAuth: jest.fn(() => ({
    requireAuth: (fn: () => void) => fn(),
    isLoginPromptVisible: false,
    loginPromptMessage: '',
    hideLoginPrompt: jest.fn(),
  })),
}));

jest.mock('@/hooks/use-calendar-filters', () => ({
  FILTER_CHIPS: [
    { key: 'theatrical', label: 'Theatrical', types: [1, 2, 3] },
    { key: 'streaming', label: 'Streaming', types: [6] },
    { key: 'digital_physical', label: 'Digital / Physical', types: [4, 5] },
  ],
  useCalendarFilters: jest.fn(() => ({
    filterTypes: new Set([1, 2, 3, 4, 5, 6]),
    watchlistOnly: false,
    setWatchlistOnly: jest.fn(),
    toggleFilterChip: jest.fn(),
    isChipActive: jest.fn(() => false),
  })),
}));

// @gorhom/bottom-sheet needs real gesture/measurement APIs not present in
// jsdom — mocked for tests the same way as __tests__/components/release-calendar-v2/release-calendar-dock.test.tsx.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  const BottomSheet = ReactActual.forwardRef(({ children, ...rest }: any, ref: any) => {
    ReactActual.useImperativeHandle(ref, () => ({
      snapToIndex: () => {},
      close: () => {},
      expand: () => {},
    }));
    return <View {...rest}>{children}</View>;
  });
  const BottomSheetView = ({ children, ...rest }: any) => <View {...rest}>{children}</View>;
  return { __esModule: true, default: BottomSheet, BottomSheetView };
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReleaseCalendarScreen />
    </QueryClientProvider>
  );
}

// The `release_calendar_v2` flag gate was stripped 2026-07-18 (issue #660) —
// the route now renders `ReleaseCalendarV2Screen` unconditionally.
describe('ReleaseCalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the v2 screen with the chip row and docked calendar, no redundant filter sheet', () => {
    const { getByTestId, getByText, getByLabelText, queryByLabelText, queryByText } = renderScreen();

    expect(getByTestId('release-calendar-v2-screen')).toBeTruthy();
    expect(getByTestId('release-calendar-v2-chip-row')).toBeTruthy();
    expect(getByTestId('release-calendar-v2-dock')).toBeTruthy();
    expect(getByText('Release Calendar')).toBeTruthy();

    // The chip row is the canonical filter UI — no header gear button and no
    // duplicate "Filters" sheet (the old v1 sheet surfaced exactly the same
    // watchlist toggle + FILTER_CHIPS the chip row already shows).
    expect(queryByLabelText('Open filters')).toBeNull();
    expect(queryByText('Filters')).toBeNull();
    // Back button remains — the header still has a single, balanced action.
    expect(getByLabelText('Go back')).toBeTruthy();

    // Results list clears the docked calendar: bottom padding comes from
    // useDockCollapsedHeight() — the SAME hook the dock uses for its own
    // collapsed snap point (base height + the mocked bottom safe-area
    // inset) — so the last card can scroll fully above the dock, and the
    // dock's "Pull up for month" hint clears the inset too (Android gesture
    // bar / iOS home indicator).
    const scroll = getByTestId('release-calendar-v2-results-scroll');
    expect(scroll.props.contentContainerStyle).toEqual({
      paddingBottom: WEEK_SNAP_BASE_HEIGHT + MOCK_SAFE_AREA_BOTTOM_INSET,
    });
  });
});
