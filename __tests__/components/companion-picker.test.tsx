/**
 * `CompanionPicker` (scan-v2) — selection + confirm/cancel + keyboard contracts
 * from #782.
 *
 * Part 1 (#785) pinned the selection-feedback fixes: a picked person stays in
 * the list wearing the selected treatment, tapping a selected row removes them,
 * and free-text companions get their own removable selected row. Founder device
 * feedback then reported three follow-ups, pinned here:
 *
 *   - selection is a DRAFT: ✓ (Done) emits it via `onConfirm`; ✕ / the scrim
 *     mean cancel — `onCancel` fires and the draft is never emitted, so the
 *     parent's opening snapshot survives untouched;
 *   - the keyboard / home-indicator inset is reserved ONCE, as the sheet's own
 *     bottom padding (keyboard height while up, safe-area inset while down) —
 *     the sheet hugs the device bottom so a measurement miss shows sheet
 *     surface, not a hole to the screen behind;
 *   - the list is flex-shrinkable so it bounds to the sheet's maxHeight and
 *     scrolls, instead of laying out at full content height and having the
 *     last row sliced by overflow:hidden;
 *   - the keyboard listener pair stays platform-correct — `keyboardWillShow`
 *     on iOS, `keyboardDidShow` on Android.
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
    initialSelection: [] as string[],
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
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

const confirmButton = (utils: ReturnType<typeof render>) => utils.getByLabelText('Done');
const cancelButton = (utils: ReturnType<typeof render>) => utils.getByLabelText('Cancel');

beforeEach(() => {
  jest.clearAllMocks();
  mockMutualFollows.mockReturnValue({ mutualFollows: [KELSIE, MARCUS], isLoading: false });
});

// ===========================================================================
// The #782 regression: a picked person must not vanish
// ===========================================================================
describe('CompanionPicker selection feedback', () => {
  it('keeps an already-selected person in the list instead of filtering them out', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

    expect(utils.getByText('Kelsie')).toBeTruthy();
    expect(utils.getByText('Marcus')).toBeTruthy();
  });

  it('renders the already-selected person with the selected treatment', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

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
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

    const selected = rowStyle(personRow(utils, 'Kelsie'));
    const unselected = rowStyle(personRow(utils, 'Marcus'));
    expect(unselected.borderWidth).toBe(selected.borderWidth);
    expect(unselected.paddingHorizontal).toBe(selected.paddingHorizontal);
  });

  it('matches an already-selected name case-insensitively', () => {
    const utils = renderPicker({ initialSelection: ['  kELSIE '] });

    expect(personRow(utils, 'Kelsie').props.accessibilityState).toEqual({ selected: true });
  });

  it('selects an unselected person in place and fires a haptic', () => {
    const utils = renderPicker();

    fireEvent.press(personRow(utils, 'Kelsie'));

    expect(personRow(utils, 'Kelsie').props.accessibilityState).toEqual({ selected: true });
    expect(hapticImpact).toHaveBeenCalledTimes(1);
  });

  it('deselects — does not re-add — when a selected person is tapped', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

    fireEvent.press(personRow(utils, 'Kelsie'));

    expect(personRow(utils, 'Kelsie').props.accessibilityState).toEqual({ selected: false });
    expect(hapticImpact).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Confirm / cancel — the draft only reaches the parent through ✓
// ===========================================================================
describe('CompanionPicker confirm/cancel semantics', () => {
  it('confirm emits the draft, preserving order with new picks appended', () => {
    const utils = renderPicker({ initialSelection: ['Marcus'] });

    fireEvent.press(personRow(utils, 'Kelsie'));
    fireEvent.press(confirmButton(utils));

    expect(utils.props.onConfirm).toHaveBeenCalledTimes(1);
    expect(utils.props.onConfirm).toHaveBeenCalledWith(['Marcus', 'Kelsie']);
    expect(utils.props.onCancel).not.toHaveBeenCalled();
  });

  it('confirm after deselecting emits the selection without that name', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie', 'Marcus'] });

    fireEvent.press(personRow(utils, 'Kelsie'));
    fireEvent.press(confirmButton(utils));

    expect(utils.props.onConfirm).toHaveBeenCalledWith(['Marcus']);
  });

  it('confirm with an untouched draft emits the opening snapshot as-is', () => {
    const utils = renderPicker({ initialSelection: [' Kelsie ', 'Dad'] });

    fireEvent.press(confirmButton(utils));

    // Pre-existing dirty v1 entries pass through untouched — handleSave owns
    // the final dedupeNames pass.
    expect(utils.props.onConfirm).toHaveBeenCalledWith([' Kelsie ', 'Dad']);
  });

  it('deselecting clears EVERY duplicate underlying entry before confirm', () => {
    const utils = renderPicker({ initialSelection: ['Dad', 'Dad'] });

    fireEvent.press(personRow(utils, 'Dad'));
    fireEvent.press(confirmButton(utils));

    expect(utils.props.onConfirm).toHaveBeenCalledWith([]);
  });

  it('✕ cancels: the draft is never emitted, however much it changed', () => {
    const utils = renderPicker({ initialSelection: ['Marcus'] });

    fireEvent.press(personRow(utils, 'Kelsie'));
    fireEvent.press(personRow(utils, 'Marcus'));
    fireEvent.press(cancelButton(utils));

    expect(utils.props.onCancel).toHaveBeenCalledTimes(1);
    expect(utils.props.onConfirm).not.toHaveBeenCalled();
  });

  it('tapping the scrim behaves like cancel', () => {
    const utils = renderPicker();

    fireEvent.press(personRow(utils, 'Kelsie'));
    fireEvent.press(utils.getByTestId('companion-picker-scrim'));

    expect(utils.props.onCancel).toHaveBeenCalledTimes(1);
    expect(utils.props.onConfirm).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Free text — the manual-add path must survive the filter change
// ===========================================================================
describe('CompanionPicker free-text add', () => {
  it('offers a trimmed free-text name and adds it to the draft', () => {
    const utils = renderPicker();

    fireEvent.changeText(utils.getByPlaceholderText(SEARCH_PLACEHOLDER), '  Dad  ');
    fireEvent.press(utils.getByText('Add “Dad”'));
    fireEvent.press(confirmButton(utils));

    expect(utils.props.onConfirm).toHaveBeenCalledWith(['Dad']);
  });

  it('shows a free-text companion as a selected row that a tap removes', () => {
    const utils = renderPicker({ initialSelection: ['Dad'] });

    const row = personRow(utils, 'Dad');
    expect(row.props.accessibilityState).toEqual({ selected: true });
    expect(rowStyle(row).backgroundColor).toBe(ScanV2Accent.soft);

    fireEvent.press(row);
    // No mutual-follow row to fall back to — a deselected free-text name
    // leaves the list entirely.
    expect(utils.queryByText('Dad')).toBeNull();
  });

  it('does not offer to re-add a name that is already selected', () => {
    const utils = renderPicker({ initialSelection: ['Dad'] });

    fireEvent.changeText(utils.getByPlaceholderText(SEARCH_PLACEHOLDER), 'Dad');
    expect(utils.queryByText('Add “Dad”')).toBeNull();
  });

  it('does not duplicate a mutual follow into a free-text row', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

    // personRow throws on >1 match, so this asserts there is exactly one Kelsie.
    expect(personRow(utils, 'Kelsie')).toBeTruthy();
  });

  it('renders one row for a name `watched_with` holds twice', () => {
    // The v1 editor (app/journey/edit/[id].tsx `handleFriendSelected`) appends
    // with no dedupe, so duplicates reach this picker from real rows. Two rows
    // would also collide on the `free:<name>` React key.
    const utils = renderPicker({ initialSelection: ['Dad', 'Dad'] });

    expect(personRow(utils, 'Dad')).toBeTruthy();
    expect(utils.getAllByText('Dad')).toHaveLength(1);
  });

  it('dedupes duplicates that differ only by case and whitespace', () => {
    const utils = renderPicker({ initialSelection: ['Dad', ' dad '] });

    expect(personRow(utils, 'Dad')).toBeTruthy();
  });

  it('does not add a draft duplicate that differs only by case', () => {
    const utils = renderPicker({ initialSelection: ['Kelsie'] });

    fireEvent.changeText(utils.getByPlaceholderText(SEARCH_PLACEHOLDER), 'kelsie');
    expect(utils.queryByText('Add “kelsie”')).toBeNull();
  });
});

// ===========================================================================
// Keyboard — platform-correct listeners, single reserved inset, scrollable list
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

  const fireKeyboardShow = (height: number) => {
    const onShow = (Keyboard.addListener as unknown as jest.Mock).mock.calls.find(
      (call) => call[0] === 'keyboardWillShow',
    )![1];
    act(() => onShow({ endCoordinates: { height } }));
  };

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

  it('reserves the bottom inset ONCE, on the sheet itself', () => {
    Platform.OS = 'ios';
    const utils = renderPicker();

    const sheetPad = () => utils.getByTestId('companion-picker-sheet').props.style.paddingBottom;

    // Keyboard down: the sheet reserves the (mocked, 34pt) safe-area inset.
    expect(sheetPad()).toBe(34);

    // Keyboard up: the sheet reserves the keyboard instead — collapsing the
    // inset, never stacking the two (#782's dead-space gap).
    fireKeyboardShow(336);
    expect(sheetPad()).toBe(336);
  });

  it('keeps the list content padding independent of the keyboard', () => {
    Platform.OS = 'ios';
    const utils = renderPicker();

    const contentPad = () => {
      const matches = utils.UNSAFE_root.findAll(
        (node: any) => node.props?.contentContainerStyle?.paddingBottom !== undefined,
      );
      if (matches.length === 0) throw new Error('no scrollable content container found');
      return matches[0].props.contentContainerStyle.paddingBottom;
    };

    const before = contentPad();
    fireKeyboardShow(336);
    expect(contentPad()).toBe(before);
  });

  it('lets the list shrink inside the sheet so the last row can scroll into view', () => {
    const utils = renderPicker();

    const scrollView = utils.UNSAFE_root.findAll(
      (node: any) => node.props?.contentContainerStyle?.paddingBottom !== undefined,
    )[0];

    // flexShrink 0 (Yoga's default) laid the list out at full content height;
    // the sheet's overflow:hidden then sliced the final row with no scroll.
    expect(scrollView.props.style).toEqual(expect.objectContaining({ flexShrink: 1 }));
  });
});
