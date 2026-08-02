/**
 * `CompanionPicker` (scan-v2) — selection-feedback contracts from #782.
 *
 * The founder tapped "Kelsie" in the "Who was there?" sheet and she VANISHED:
 * the results memo excluded every already-added name, so a successful pick was
 * indistinguishable from a dead tap (the confirmation chips render in the parent
 * sheet, behind this picker's 0.88 scrim). These tests pin the corrected
 * behavior so the filter can't come back:
 *
 *   - a picked person STAYS in the list, wearing the selected treatment;
 *   - tapping a selected person removes them (`onRemove`), it does not re-add;
 *   - free-text additions still work, and a free-text companion gets its own
 *     removable selected row (it has no mutual-follow row to live on);
 *   - the keyboard listener pair is platform-correct — `keyboardWillShow` on
 *     iOS (the in-repo pattern from `edit-sheet.tsx`), `keyboardDidShow` on
 *     Android — and the picker no longer double-reserves the bottom inset.
 */
import React from 'react';
import { Keyboard, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — matches the stubbing style of first-take-sheet-contracts.test.tsx.
// `Avatar` is stubbed outright: it reaches SvgXml + analytics feature flags,
// none of which this component's contracts depend on.
// ---------------------------------------------------------------------------
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, Circle: View, Rect: View, Text };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
  };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/components/ui/avatar', () => {
  const { View } = require('react-native');
  return { Avatar: View };
});

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticSelection: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

const mockMutualFollows = jest.fn();
jest.mock('@/hooks/use-mutual-follows', () => ({
  useMutualFollows: () => mockMutualFollows(),
}));

import { CompanionPicker } from '@/components/scan-v2/companion-picker';
import { hapticImpact } from '@/lib/haptics';
import { ScanV2Accent } from '@/constants/scan-v2-theme';

const KELSIE = {
  id: 'p-kelsie',
  full_name: 'Kelsie',
  username: 'kels',
  avatar_url: null,
  updated_at: null,
};
const MARCUS = {
  id: 'p-marcus',
  full_name: 'Marcus',
  username: 'marc',
  avatar_url: null,
  updated_at: null,
};

const SEARCH_PLACEHOLDER = 'Search people or type a name…';

const renderPicker = (overrides: Partial<React.ComponentProps<typeof CompanionPicker>> = {}) => {
  const props = {
    userId: 'user-1',
    alreadyAdded: [] as string[],
    onAdd: jest.fn(),
    onRemove: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  return { ...render(<CompanionPicker {...props} />), props };
};

/**
 * Rows are icon-and-avatar only, so there is no testID to query. Find the one
 * `Pressable` whose accessibilityLabel identifies this person; a miss throws
 * rather than silently pressing the wrong control.
 * (`UNSAFE_getAllByType(Pressable)` finds nothing in this repo — Pressable
 * resolves to a function component, so match on `type.name`.)
 */
const personRow = (utils: ReturnType<typeof render>, name: string) => {
  const matches = utils.UNSAFE_root.findAll(
    (node: any) =>
      typeof node.type === 'function' &&
      node.type.name === 'Pressable' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(name),
  );
  if (matches.length !== 1) {
    throw new Error(`expected exactly 1 row for "${name}", found ${matches.length}`);
  }
  return matches[0];
};

/** Resolve the row's style callback the way Pressable does when not pressed. */
const rowStyle = (row: any) => {
  const style = row.props.style;
  return typeof style === 'function' ? style({ pressed: false }) : style;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMutualFollows.mockReturnValue({ mutualFollows: [KELSIE, MARCUS], isLoading: false });
});

// ===========================================================================
// The #782 regression: a picked person must not vanish
// ===========================================================================
describe('CompanionPicker selection feedback', () => {
  it('keeps an already-added person in the list instead of filtering them out', () => {
    const utils = renderPicker({ alreadyAdded: ['Kelsie'] });

    expect(utils.getByText('Kelsie')).toBeTruthy();
    expect(utils.getByText('Marcus')).toBeTruthy();
  });

  it('renders the already-added person with the selected treatment', () => {
    const utils = renderPicker({ alreadyAdded: ['Kelsie'] });

    const selected = rowStyle(personRow(utils, 'Kelsie'));
    expect(selected.borderColor).toBe(ScanV2Accent.primary);
    expect(selected.backgroundColor).toBe(ScanV2Accent.soft);
    expect(personRow(utils, 'Kelsie').props.accessibilityState).toEqual({ selected: true });

    const unselected = rowStyle(personRow(utils, 'Marcus'));
    expect(unselected.borderColor).toBe('transparent');
    expect(unselected.backgroundColor).toBe('transparent');
    expect(personRow(utils, 'Marcus').props.accessibilityState).toEqual({ selected: false });
  });

  it('reserves the border on unselected rows so toggling does not shift the list', () => {
    const utils = renderPicker({ alreadyAdded: ['Kelsie'] });

    const selected = rowStyle(personRow(utils, 'Kelsie'));
    const unselected = rowStyle(personRow(utils, 'Marcus'));
    expect(unselected.borderWidth).toBe(selected.borderWidth);
    expect(unselected.paddingHorizontal).toBe(selected.paddingHorizontal);
  });

  it('matches an already-added name case-insensitively', () => {
    const utils = renderPicker({ alreadyAdded: ['  kELSIE '] });

    expect(personRow(utils, 'Kelsie').props.accessibilityState).toEqual({ selected: true });
  });

  it('adds an unselected person and fires a haptic', () => {
    const utils = renderPicker();

    fireEvent.press(personRow(utils, 'Kelsie'));

    expect(utils.props.onAdd).toHaveBeenCalledWith('Kelsie');
    expect(utils.props.onRemove).not.toHaveBeenCalled();
    expect(hapticImpact).toHaveBeenCalledTimes(1);
  });

  it('removes — does not re-add — when a selected person is tapped', () => {
    const utils = renderPicker({ alreadyAdded: ['Kelsie'] });

    fireEvent.press(personRow(utils, 'Kelsie'));

    expect(utils.props.onRemove).toHaveBeenCalledWith('Kelsie');
    expect(utils.props.onAdd).not.toHaveBeenCalled();
    expect(hapticImpact).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Free text — the manual-add path must survive the filter change
// ===========================================================================
describe('CompanionPicker free-text add', () => {
  it('offers and emits a trimmed free-text name', () => {
    const utils = renderPicker();

    fireEvent.changeText(utils.getByPlaceholderText(SEARCH_PLACEHOLDER), '  Dad  ');
    fireEvent.press(utils.getByText('Add “Dad”'));

    expect(utils.props.onAdd).toHaveBeenCalledWith('Dad');
  });

  it('shows a free-text companion as a selected, removable row', () => {
    const utils = renderPicker({ alreadyAdded: ['Dad'] });

    const row = personRow(utils, 'Dad');
    expect(row.props.accessibilityState).toEqual({ selected: true });
    expect(rowStyle(row).backgroundColor).toBe(ScanV2Accent.soft);

    fireEvent.press(row);
    expect(utils.props.onRemove).toHaveBeenCalledWith('Dad');
  });

  it('does not offer to re-add a name that is already selected', () => {
    const utils = renderPicker({ alreadyAdded: ['Dad'] });

    fireEvent.changeText(utils.getByPlaceholderText(SEARCH_PLACEHOLDER), 'Dad');
    expect(utils.queryByText('Add “Dad”')).toBeNull();
  });

  it('does not duplicate a mutual follow into a free-text row', () => {
    const utils = renderPicker({ alreadyAdded: ['Kelsie'] });

    // personRow throws on >1 match, so this asserts there is exactly one Kelsie.
    expect(personRow(utils, 'Kelsie')).toBeTruthy();
  });

  it('renders one row for a name `watched_with` holds twice', () => {
    // The v1 editor (app/journey/edit/[id].tsx `handleFriendSelected`) appends
    // with no dedupe, so duplicates reach this picker from real rows. Two rows
    // would also collide on the `free:<name>` React key.
    const utils = renderPicker({ alreadyAdded: ['Dad', 'Dad'] });

    expect(personRow(utils, 'Dad')).toBeTruthy();
    expect(utils.getAllByText('Dad')).toHaveLength(1);
  });

  it('dedupes duplicates that differ only by case and whitespace', () => {
    const utils = renderPicker({ alreadyAdded: ['Dad', ' dad '] });

    expect(personRow(utils, 'Dad')).toBeTruthy();
  });

  it('removes by name so one tap clears every duplicate entry', () => {
    const utils = renderPicker({ alreadyAdded: ['Dad', 'Dad'] });

    fireEvent.press(personRow(utils, 'Dad'));

    // One visible row implies one removal — the parent filters every match.
    expect(utils.props.onRemove).toHaveBeenCalledTimes(1);
    expect(utils.props.onRemove).toHaveBeenCalledWith('Dad');
  });
});

// ===========================================================================
// Keyboard — platform-correct listeners, single reserved inset
// ===========================================================================
describe('CompanionPicker keyboard handling', () => {
  const listenerEvents = () =>
    (Keyboard.addListener as unknown as jest.Mock).mock.calls.map((call) => call[0]);

  let addListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    addListenerSpy = jest
      .spyOn(Keyboard, 'addListener')
      .mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    addListenerSpy.mockRestore();
    Platform.OS = 'ios';
  });

  it('uses keyboardWillShow/WillHide on iOS — the shared in-repo pattern', () => {
    Platform.OS = 'ios';
    renderPicker();

    expect(listenerEvents()).toEqual(['keyboardWillShow', 'keyboardWillHide']);
  });

  it('uses keyboardDidShow/DidHide on Android', () => {
    Platform.OS = 'android';
    renderPicker();

    expect(listenerEvents()).toEqual(['keyboardDidShow', 'keyboardDidHide']);
  });

  it('reserves the home-indicator inset only while the keyboard is down', () => {
    Platform.OS = 'ios';
    const utils = renderPicker();

    // insets.bottom is mocked to 34; the base content padding is s(20).
    const padding = () => {
      const matches = utils.UNSAFE_root.findAll(
        (node: any) => node.props?.contentContainerStyle?.paddingBottom !== undefined,
      );
      if (matches.length === 0) throw new Error('no scrollable content container found');
      return matches[0].props.contentContainerStyle.paddingBottom;
    };

    const downPadding = padding();
    expect(downPadding).toBeGreaterThan(34);

    const onShow = (Keyboard.addListener as unknown as jest.Mock).mock.calls.find(
      (call) => call[0] === 'keyboardWillShow',
    )![1];
    act(() => onShow({ endCoordinates: { height: 336 } }));

    // The outer container already lifts by the keyboard height; adding the
    // inset on top of it is the ~54pt dead gap from #782.
    expect(padding()).toBeCloseTo(downPadding - 34, 5);
  });
});
