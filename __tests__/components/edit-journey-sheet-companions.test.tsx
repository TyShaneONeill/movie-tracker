/**
 * `EditJourneySheet` companion state — the parent half of #782.
 *
 * The picker now edits a DRAFT and hands the whole selection back through
 * `onConfirm`; cancel (`onCancel` — the ✕ or the scrim) just closes. So the
 * parent contract is small and absolute:
 *
 *   - the picker opens seeded with the current companions (the snapshot);
 *   - confirm REPLACES the companions with the emitted selection and closes;
 *   - cancel closes and the snapshot survives untouched — there is no
 *     parent-side mutation path left for a picker session to leak through;
 *   - Save serializes the confirmed selection into `watched_with`, deduped
 *     (dirty v1-written rows can hold duplicates / stray whitespace).
 *
 * Trim/normalized-dedupe of names ADDED in a session moved into the picker's
 * draft logic and is pinned in companion-picker.test.tsx.
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
// drive onConfirm/onCancel and read back what the sheet hands to the NEXT open.
let pickerProps: {
  initialSelection: string[];
  onConfirm: (names: string[]) => void;
  onCancel: () => void;
} | null = null;

jest.mock('@/components/scan-v2/companion-picker', () => {
  const { View } = require('react-native');
  return {
    CompanionPicker: (props: any) => {
      pickerProps = props;
      return <View testID="companion-picker-probe" />;
    },
  };
});

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
  it('hands the picker the current companions as the opening snapshot', () => {
    renderSheet(['Kelsie']);
    expect(pickerProps!.initialSelection).toEqual(['Kelsie']);
  });

  it('applies a confirmed selection and closes the picker', () => {
    const utils = renderSheet([]);

    act(() => pickerProps!.onConfirm(['Kelsie', 'Dad']));

    expect(utils.queryByTestId('companion-picker-probe')).toBeNull();
    // The chips row renders the applied companions.
    expect(utils.getByText('Kelsie')).toBeTruthy();
    expect(utils.getByText('Dad')).toBeTruthy();

    // Reopening seeds the picker with what was confirmed.
    openPicker(utils);
    expect(pickerProps!.initialSelection).toEqual(['Kelsie', 'Dad']);
  });

  it('confirm replaces the previous selection wholesale', () => {
    const utils = renderSheet(['Kelsie', 'Marcus']);

    act(() => pickerProps!.onConfirm(['Marcus']));

    expect(utils.queryByText('Kelsie')).toBeNull();
    openPicker(utils);
    expect(pickerProps!.initialSelection).toEqual(['Marcus']);
  });

  it('cancel closes the picker and leaves the snapshot untouched', () => {
    const utils = renderSheet(['Kelsie']);

    act(() => pickerProps!.onCancel());

    expect(utils.queryByTestId('companion-picker-probe')).toBeNull();
    expect(utils.getByText('Kelsie')).toBeTruthy();
    openPicker(utils);
    expect(pickerProps!.initialSelection).toEqual(['Kelsie']);
  });

  it('Save serializes the confirmed companions into watched_with, deduped', () => {
    const utils = renderSheet(null);

    // Dirty shapes a picker session can legitimately hand back: pre-existing
    // v1 rows carry duplicates and stray whitespace the user never touched.
    act(() => pickerProps!.onConfirm(['Kelsie', ' kelsie ', 'Dad']));
    fireEvent.press(utils.getByText('Save'));

    expect(utils.props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ watched_with: ['Kelsie', 'Dad'] }),
    );
  });

  it('Save sends null when the confirmed selection is empty', () => {
    const utils = renderSheet(['Kelsie']);

    act(() => pickerProps!.onConfirm([]));
    fireEvent.press(utils.getByText('Save'));

    expect(utils.props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ watched_with: null }),
    );
  });
});
