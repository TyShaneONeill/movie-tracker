/**
 * Regression cover for the four composer defects PR #777's contract suite
 * pinned as `it.failing`:
 *
 *   1. FirstTakeSheet had no keyboard guard, so a backdrop swipe with the
 *      keyboard up abandoned the whole batch AND left the scan flow (its only
 *      call site passes the same handler for onClose and onDone).
 *   2. FirstTakeModal's only double-submit protection was the caller's
 *      `isSubmitting` PROP, which closes the window one render too late.
 *   3. FirstTakeSheet committed the quote untrimmed.
 *   4. MultiFirstTakeModal required words, so a rating-only take was postable
 *      from two composers out of three.
 *
 * The behaviours themselves are specified by #777's suites — this file exists
 * so the fixes are covered on `main` before that (tests-only, draft) PR lands.
 * Guard assertions follow the shape of first-take-modal-keyboard-guard.test.tsx
 * (#736), including the flag-off legacy case.
 */
import React from 'react';
import { Alert, Keyboard, StyleSheet, TextInput } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import type { ReviewVisibility } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Mocks — the union of what the three composers reach for
// ---------------------------------------------------------------------------
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticSelection: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@react-native-community/slider', () => 'Slider');

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
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
  useEffectiveColorScheme: () => 'light',
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: { reviewVisibility: 'public' as ReviewVisibility } }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockCreateFirstTake = jest.fn();
jest.mock('@/lib/first-take-service', () => ({
  createFirstTake: (...args: unknown[]) => mockCreateFirstTake(...args),
}));

// Flag value the guard hook reads; flipped per test.
const mockGetFeatureFlag = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
    reloadFeatureFlags: jest.fn(),
  },
}));

import { FirstTakeModal } from '@/components/first-take-modal';
import { MultiFirstTakeModal } from '@/components/multi-first-take-modal';
import { FirstTakeSheet } from '@/components/scan-v2/first-take-sheet';
import type { SavedMovie } from '@/lib/scan-save';

const SHEET_PLACEHOLDER =
  'e.g. The IMAX sound design wrecked me — did not see that ending coming.';
const MODAL_PLACEHOLDER = 'What did you think? No spoilers unless you toggle below...';

const ONE: SavedMovie[] = [{ tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' }];
const TWO: SavedMovie[] = [
  { tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' },
  { tmdbId: 157336, title: 'Interstellar', posterPath: '/b.jpg' },
];

const setGuard = (on: boolean) =>
  mockGetFeatureFlag.mockImplementation((flag: string) =>
    flag === 'modal_keyboard_guard' ? on : undefined
  );

const renderSheet = (overrides: Partial<React.ComponentProps<typeof FirstTakeSheet>> = {}) =>
  render(
    <FirstTakeSheet
      userId="user-1"
      movies={ONE}
      defaultVisibility="public"
      onClose={jest.fn()}
      onDone={jest.fn()}
      {...overrides}
    />
  );

/** Walk the wizard forward one step via the primary action. */
const tapContinue = (utils: ReturnType<typeof render>) =>
  fireEvent.press(utils.getByText('Continue'));

// The sheet's ✕ is icon-only with no testID; it is the only Pressable in the
// tree with hitSlop 8, and a miss throws rather than pressing the wrong control.
const closeButton = (utils: ReturnType<typeof render>) => {
  const match = utils.UNSAFE_root.findAll(
    (node: any) =>
      typeof node.type === 'function' && node.type.name === 'Pressable' && node.props.hitSlop === 8
  );
  if (match.length !== 1) throw new Error(`expected exactly 1 ✕ Pressable, found ${match.length}`);
  return match[0];
};

let isVisibleSpy: jest.SpyInstance;
let dismissSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFirstTake.mockResolvedValue({ id: 'take-1' });
  setGuard(true);
  isVisibleSpy = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  isVisibleSpy.mockRestore();
  dismissSpy.mockRestore();
  alertSpy.mockRestore();
});

// ===========================================================================
// 1. Keyboard guard on the scanner sheet
// ===========================================================================
describe('FirstTakeSheet keyboard guard (backdrop dismiss)', () => {
  it('guard ON + keyboard visible: backdrop press dismisses keyboard, does NOT close', () => {
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const utils = renderSheet({ onClose });
    tapContinue(utils); // → reaction step (autoFocus, keyboard up)
    fireEvent.changeText(utils.getByPlaceholderText(SHEET_PLACEHOLDER), 'half a thought');

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The draft survives — the sheet is still on the reaction step.
    expect(utils.getByPlaceholderText(SHEET_PLACEHOLDER).props.value).toBe('half a thought');
  });

  it('guard ON: falls back to focused-input check when Keyboard.isVisible() is stale-false', () => {
    // Android inside a Modal can report isVisible()=false while an input is
    // focused and the IME is up — the focused-input fallback must still guard.
    const focusedSpy = jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue({} as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
    const onClose = jest.fn();
    const utils = renderSheet({ onClose });

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    focusedSpy.mockRestore();
  });

  it('guard ON + keyboard hidden: backdrop press closes the sheet', () => {
    const onClose = jest.fn();
    const utils = renderSheet({ onClose });

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('guard OFF: backdrop press closes even with the keyboard visible (legacy behavior)', () => {
    setGuard(false);
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const utils = renderSheet({ onClose });

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the ✕ still abandons immediately, keyboard up (explicit intent is not guarded)', () => {
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const utils = renderSheet({ movies: TWO, onClose });
    tapContinue(utils);
    fireEvent.changeText(utils.getByPlaceholderText(SHEET_PLACEHOLDER), 'words');

    fireEvent.press(closeButton(utils));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });
});

describe('FirstTakeSheet mid-batch abandon confirm', () => {
  it('a keyboard-down backdrop press mid-batch confirms before abandoning the rest', () => {
    const onClose = jest.fn();
    const utils = renderSheet({ movies: TWO, onClose });

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(onClose).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toContain('all 2 remaining movies');

    // Confirming ("Skip All") is what actually abandons the batch.
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Skip All')?.onPress?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no confirm once the batch reaches its last movie — nothing is left to abandon', async () => {
    const onClose = jest.fn();
    const utils = renderSheet({ movies: TWO, onClose });
    // Post the first movie so the wizard advances to the last one. With no
    // words the reaction step jumps the spoiler step, so three taps reach the
    // summary.
    tapContinue(utils);
    tapContinue(utils);
    tapContinue(utils);
    fireEvent.press(utils.getByText('Post & next movie'));
    await waitFor(() => expect(utils.getByText('2 / 2')).toBeTruthy());

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a backdrop press while a post is in flight', async () => {
    // Otherwise the press and postMovie's own closure both settle on the last
    // movie, and the call site's shared onClose/onDone handler fires twice.
    let release: (value: unknown) => void = () => {};
    mockCreateFirstTake.mockImplementation(
      () => new Promise((resolve) => { release = resolve; })
    );
    const onClose = jest.fn();
    const onDone = jest.fn();
    const utils = renderSheet({ onClose, onDone });
    tapContinue(utils);
    tapContinue(utils);
    tapContinue(utils);
    fireEvent.press(utils.getByText('Post First Take'));

    fireEvent.press(utils.getByTestId('first-take-sheet-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { release({ id: 'take-1' }); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. FirstTakeModal internal double-submit latch
// ===========================================================================
describe('FirstTakeModal double-submit latch', () => {
  const renderModal = (overrides: Partial<React.ComponentProps<typeof FirstTakeModal>> = {}) =>
    render(
      <FirstTakeModal
        visible
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        movieTitle="Inception"
        {...overrides}
      />
    );

  it('two same-frame presses post exactly once, without the caller driving isSubmitting', async () => {
    let release: () => void = () => {};
    const onSubmit = jest.fn(
      () => new Promise<void>((resolve) => { release = () => resolve(); })
    );
    const utils = renderModal({ onSubmit });

    fireEvent.changeText(utils.getByPlaceholderText(MODAL_PLACEHOLDER), 'Once only');
    const button = utils.getByText('Post First Take');
    fireEvent.press(button);
    fireEvent.press(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('releases the latch so a later, deliberate submit still posts', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = renderModal({ onSubmit });

    fireEvent.changeText(utils.getByPlaceholderText(MODAL_PLACEHOLDER), 'First');
    fireEvent.press(utils.getByText('Post First Take'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    fireEvent.changeText(utils.getByPlaceholderText(MODAL_PLACEHOLDER), 'Second');
    fireEvent.press(utils.getByText('Post First Take'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  // A failed submit must release the latch too, or the button would be dead
  // until the modal is reopened — that is what the `finally` in handleSubmit is
  // for. It is not asserted here: a rejecting onSubmit propagates out of the
  // (unawaited) press handler, which the runner reports as an unhandled
  // rejection regardless of the latch. That propagation predates this change.
});

// ===========================================================================
// 3. Parity — the sheet trims, the batch modal accepts a rating-only take
// ===========================================================================
describe('FirstTakeSheet quote trimming', () => {
  it('trims the quote before committing, like the other two composers', async () => {
    const utils = renderSheet();
    tapContinue(utils); // → reaction
    fireEvent.changeText(utils.getByPlaceholderText(SHEET_PLACEHOLDER), '   padded   ');
    tapContinue(utils); // → spoiler
    tapContinue(utils); // → visibility
    tapContinue(utils); // → summary
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].quoteText).toBe('padded');
  });
});

describe('MultiFirstTakeModal submit gate', () => {
  const renderMulti = (movies = [{ tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' }]) =>
    render(<MultiFirstTakeModal visible movies={movies} onComplete={jest.fn()} />);

  it('an untouched composer cannot post — no phantom 5/10', () => {
    // The gate accepts a rating alone, so the rating must not arrive armed:
    // a 5 default would let a 10-ticket batch record ten scores nobody chose.
    const utils = renderMulti();

    // Muted, not the accent slab — it has to read as a placeholder, not a score.
    const placeholder = utils.getByText('–');
    expect(StyleSheet.flatten(placeholder.props.style).color).toBe(Colors.light.textTertiary);

    fireEvent.press(utils.getByText('Done'));

    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });

  it('a drag that ends on the floor still registers a rating', async () => {
    // Android's ProgressBar.setProgressInternal early-returns when the computed
    // progress equals the current one, and the thumb parks at 1 while unrated —
    // so dragging to 1/10 fired no onValueChange and the take was silently
    // unsubmittable. onSlidingComplete is the backstop. (Device-reproduced, A6.)
    const utils = renderMulti();
    fireEvent(utils.UNSAFE_getByType('Slider' as any), 'slidingComplete', 1);

    expect(utils.queryByText('–')).toBeNull();
    fireEvent.press(utils.getByText('Done'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1]).toMatchObject({ rating: 1, quoteText: '' });
  });

  it('accepts a rating-only take, like the other two composers', async () => {
    const utils = renderMulti();
    fireEvent(utils.UNSAFE_getByType('Slider' as any), 'valueChange', 8);

    fireEvent.press(utils.getByText('Done'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1]).toMatchObject({ rating: 8, quoteText: '' });
  });

  it('accepts a words-only take, committing a null rating rather than a default', async () => {
    const utils = renderMulti();
    fireEvent.changeText(utils.getByPlaceholderText(MODAL_PLACEHOLDER), '  a real take  ');

    fireEvent.press(utils.getByText('Done'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1]).toMatchObject({
      quoteText: 'a real take',
      rating: null,
    });
  });

  it('resets the rating to unset between movies in a batch', async () => {
    const utils = renderMulti([
      { tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' },
      { tmdbId: 157336, title: 'Interstellar', posterPath: '/b.jpg' },
    ]);
    fireEvent(utils.UNSAFE_getByType('Slider' as any), 'valueChange', 8);
    fireEvent.press(utils.getByText('Next'));
    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));

    // Second movie starts unrated — the previous score must not carry over and
    // re-arm the button.
    expect(utils.getByText('–')).toBeTruthy();
    fireEvent.press(utils.getByText('Done'));
    expect(mockCreateFirstTake).toHaveBeenCalledTimes(1);
  });
});
