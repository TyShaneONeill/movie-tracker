/**
 * `EditJourneySheet` companion state — the parent half of #782.
 *
 * `watched_with` is a `text[]` of display names with NO foreign key, and the v1
 * editor (`app/journey/edit/[id].tsx` `handleFriendSelected`) appends the raw
 * display name with no dedupe and no trim. So this sheet must treat names as
 * dirty input: duplicates and stray whitespace both arrive from real rows.
 *
 * `CompanionPicker` is replaced with a probe that captures its props, so these
 * tests exercise the sheet's `addCompanion` / `removeCompanionByName` state
 * transitions directly rather than driving them through the picker's UI (the
 * picker's own rendering contracts live in companion-picker.test.tsx).
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, Circle: View, Rect: View, Text };
});

jest.mock('expo-image', () => {
  const { Image } = require('react-native');
  return { Image };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn() }));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticSelection: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/hooks/use-mutual-follows', () => ({
  useMutualFollows: () => ({ mutualFollows: [], isLoading: false }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/image-utils', () => ({ pickImage: jest.fn() }));

jest.mock('@/components/ui/avatar', () => {
  const { View } = require('react-native');
  return { Avatar: View };
});
jest.mock('@/components/journey/signed-photo', () => {
  const { View } = require('react-native');
  return { SignedPhoto: View };
});

// Probe: capture the picker's props instead of rendering it, so the tests can
// drive onAdd/onRemove and read back what the sheet holds as selected.
let pickerProps: {
  alreadyAdded: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
} | null = null;

jest.mock('@/components/scan-v2/companion-picker', () => ({
  CompanionPicker: (props: any) => {
    pickerProps = props;
    return null;
  },
}));

import { EditJourneySheet } from '@/components/scan-v2/edit-journey-sheet';

const journey = (watchedWith: string[] | null) =>
  ({
    id: 'j-1',
    user_id: 'user-1',
    movie_id: 1,
    watched_date: '2026-08-01T19:00:00.000Z',
    watched_with: watchedWith,
    watch_format: 'standard',
    tagline: null,
    notes: null,
    location_name: null,
    seat_location: null,
    auditorium: null,
    ticket_price: null,
    ticket_id: null,
    journey_photos: null,
    watch_time: null,
  }) as any;

const openPicker = (utils: ReturnType<typeof render>) => {
  fireEvent.press(utils.getByText('Add person'));
};

const renderSheet = (watchedWith: string[] | null) => {
  const props = { journey: journey(watchedWith), onClose: jest.fn(), onSave: jest.fn() };
  const utils = render(<EditJourneySheet {...props} />);
  openPicker(utils);
  return { ...utils, props };
};

beforeEach(() => {
  jest.clearAllMocks();
  pickerProps = null;
});

describe('EditJourneySheet companion state', () => {
  it('hands the picker the current companions', () => {
    renderSheet(['Kelsie']);
    expect(pickerProps!.alreadyAdded).toEqual(['Kelsie']);
  });

  it('adds a new companion', () => {
    renderSheet([]);
    act(() => pickerProps!.onAdd('Kelsie'));
    expect(pickerProps!.alreadyAdded).toEqual(['Kelsie']);
  });

  it('does not duplicate a companion stored with surrounding whitespace', () => {
    // The v1 editor appends the raw display name, so ' Kelsie ' is a real
    // stored value; comparing it untrimmed against a trimmed candidate let a
    // second copy through.
    renderSheet([' Kelsie ']);
    act(() => pickerProps!.onAdd('Kelsie'));
    expect(pickerProps!.alreadyAdded).toEqual([' Kelsie ']);
  });

  it('does not duplicate a companion that differs only by case', () => {
    renderSheet(['Kelsie']);
    act(() => pickerProps!.onAdd('kelsie'));
    expect(pickerProps!.alreadyAdded).toEqual(['Kelsie']);
  });

  it('trims the name it stores', () => {
    renderSheet([]);
    act(() => pickerProps!.onAdd('  Dad  '));
    expect(pickerProps!.alreadyAdded).toEqual(['Dad']);
  });

  it('ignores a whitespace-only name', () => {
    renderSheet([]);
    act(() => pickerProps!.onAdd('   '));
    expect(pickerProps!.alreadyAdded).toEqual([]);
  });

  it('removes by name', () => {
    renderSheet(['Kelsie', 'Marcus']);
    act(() => pickerProps!.onRemove('Kelsie'));
    expect(pickerProps!.alreadyAdded).toEqual(['Marcus']);
  });

  it('clears EVERY duplicate entry on one removal', () => {
    // The picker renders one deduped row per name, so a single tap has to
    // clear all of the underlying entries or a phantom copy survives.
    renderSheet(['Dad', 'Dad', 'Marcus']);
    act(() => pickerProps!.onRemove('Dad'));
    expect(pickerProps!.alreadyAdded).toEqual(['Marcus']);
  });

  it('removes entries that differ from the tapped name by case and whitespace', () => {
    renderSheet([' dad ', 'Dad', 'Marcus']);
    act(() => pickerProps!.onRemove('Dad'));
    expect(pickerProps!.alreadyAdded).toEqual(['Marcus']);
  });
});
