import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReleaseCalendarScreen from '@/app/release-calendar';
import { useReleaseCalendarV2 } from '@/hooks/use-release-calendar-v2';

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

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@/hooks/use-release-calendar-v2', () => ({
  useReleaseCalendarV2: jest.fn(),
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

const mockUseReleaseCalendarV2 = useReleaseCalendarV2 as jest.Mock;

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReleaseCalendarScreen />
    </QueryClientProvider>
  );
}

describe('ReleaseCalendarScreen release_calendar_v2 gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flag OFF → renders the v1 screen (no v2 chip row or dock)', () => {
    mockUseReleaseCalendarV2.mockReturnValue({ variant: 'v1', resolving: false });
    const { queryByTestId, getByText } = renderScreen();

    expect(queryByTestId('release-calendar-v2-screen')).toBeNull();
    expect(queryByTestId('release-calendar-v2-chip-row')).toBeNull();
    expect(queryByTestId('release-calendar-v2-dock')).toBeNull();
    expect(getByText('Release Calendar')).toBeTruthy();
  });

  it('flag ON → renders the v2 screen with the chip row and docked calendar', () => {
    mockUseReleaseCalendarV2.mockReturnValue({ variant: 'v2', resolving: false });
    const { getByTestId, getByText } = renderScreen();

    expect(getByTestId('release-calendar-v2-screen')).toBeTruthy();
    expect(getByTestId('release-calendar-v2-chip-row')).toBeTruthy();
    expect(getByTestId('release-calendar-v2-dock')).toBeTruthy();
    expect(getByText('Release Calendar')).toBeTruthy();
  });

  it('resolving → holds a neutral screen (neither v1 nor v2)', () => {
    mockUseReleaseCalendarV2.mockReturnValue({ variant: 'v1', resolving: true });
    const { queryByTestId, queryByText } = renderScreen();

    expect(queryByTestId('release-calendar-v2-screen')).toBeNull();
    expect(queryByText('Release Calendar')).toBeNull();
  });
});
