/**
 * `FirstTakeSheet` (scan-v2) behavioral contracts.
 *
 * This is the DEFAULT path off a live ticket scan — the highest-traffic First
 * Take composer — and it had no direct coverage before this suite. It is also
 * the composer that differs most from the other two: a 5-step skippable wizard
 * that commits through `createFirstTake` itself (the other two hand a payload
 * back to their caller), and it is mounted/unmounted rather than driven by a
 * `visible` prop, so there is no reopen path to restore a draft into.
 *
 * Contracts pinned here:
 *   - 280-character reaction budget (parity with the other two composers).
 *   - Rating: 0.1 granularity, clamped to 1.0–10.0, `null` until the user acts.
 *   - Spoiler flag reaches `createFirstTake` — and is force-cleared when the
 *     take has no words (a deliberate rule, see `first-take-sheet.tsx:142`).
 *   - Visibility seeds from the user's saved default, maps design→DB keys.
 *   - Batch: one step-sequence per `SavedMovie`, per-item commit, advance.
 *   - `DUPLICATE_FIRST_TAKE` is swallowed so the batch keeps moving.
 *   - Rapid double-submit commits exactly once (the `postingRef` latch).
 *
 * One contract is DELIBERATELY RED (`it.failing`): the keyboard-guard rule that
 * shipped to 100% for the other two composers is absent here. See the block
 * comment on that test.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — scan-v2 primitives reach react-native-svg; the sheet reaches
// expo-image + safe-area. Matches the stubbing style of
// __tests__/components/scan-v2-journey-screen.test.tsx.
// ---------------------------------------------------------------------------
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

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticSelection: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockCreateFirstTake = jest.fn();
jest.mock('@/lib/first-take-service', () => ({
  createFirstTake: (...args: unknown[]) => mockCreateFirstTake(...args),
}));

import { FirstTakeSheet } from '@/components/scan-v2/first-take-sheet';
import { captureException } from '@/lib/sentry';
import type { SavedMovie } from '@/lib/scan-save';

const MAX_REACTION = 280;
const REACTION_PLACEHOLDER =
  'e.g. The IMAX sound design wrecked me — did not see that ending coming.';

const ONE: SavedMovie[] = [{ tmdbId: 27205, title: 'Inception', posterPath: '/poster.jpg' }];
const TWO: SavedMovie[] = [
  { tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' },
  { tmdbId: 157336, title: 'Interstellar', posterPath: '/b.jpg' },
];

const renderSheet = (overrides: Partial<React.ComponentProps<typeof FirstTakeSheet>> = {}) => {
  const props = {
    userId: 'user-1',
    movies: ONE,
    defaultVisibility: 'public' as const,
    onClose: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  };
  return { ...render(<FirstTakeSheet {...props} />), props };
};

/** Walk the wizard forward one step via the primary action. */
const tapContinue = (utils: ReturnType<typeof render>) =>
  fireEvent.press(utils.getByText('Continue'));

// The sheet's chrome buttons (backdrop / ✕ / back chevron) are icon-only, so
// there is no text or testID to query. Each is identified by a prop that is
// unique to it in this tree; a miss throws rather than silently pressing the
// wrong control.
const findPressable = (
  utils: ReturnType<typeof render>,
  name: string,
  predicate: (props: Record<string, any>) => boolean,
) => {
  const match = utils.UNSAFE_root.findAll(
    (node: any) =>
      typeof node.type === 'function' &&
      node.type.name === 'Pressable' &&
      predicate(node.props),
  );
  if (match.length !== 1) {
    throw new Error(`expected exactly 1 "${name}" Pressable, found ${match.length}`);
  }
  return match[0];
};

/** Full-bleed dismiss layer behind the sheet. */
const backdrop = (utils: ReturnType<typeof render>) =>
  findPressable(utils, 'backdrop', (p) => p.style?.backgroundColor === 'rgba(0,0,0,0.55)');

/** Top-right ✕ — abandons the batch. */
const closeButton = (utils: ReturnType<typeof render>) =>
  findPressable(utils, '✕', (p) => p.hitSlop === 8);

/** Header chevron — steps backwards across step and movie boundaries. */
const backButton = (utils: ReturnType<typeof render>) =>
  findPressable(utils, 'back', (p) => p.hitSlop === 6);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateFirstTake.mockResolvedValue({ id: 'take-1' });
});

// ===========================================================================
// Reaction budget — the #762 parity contract, asserted on the RENDERED input
// ===========================================================================
describe('FirstTakeSheet reaction budget', () => {
  it(`offers ${MAX_REACTION} characters, matching the other two composers`, () => {
    const utils = renderSheet();
    tapContinue(utils); // step 0 (rating) → step 1 (reaction)

    expect(utils.getByText(`0/${MAX_REACTION}`)).toBeTruthy();
    expect(utils.getByPlaceholderText(REACTION_PLACEHOLDER).props.maxLength).toBe(MAX_REACTION);
  });

  it('counts up to the limit and commits max-length text unchanged', async () => {
    const utils = renderSheet();
    tapContinue(utils);

    const maxText = 'x'.repeat(MAX_REACTION);
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), maxText);
    expect(utils.getByText(`${MAX_REACTION}/${MAX_REACTION}`)).toBeTruthy();

    tapContinue(utils); // → spoiler
    tapContinue(utils); // → visibility
    tapContinue(utils); // → summary
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].quoteText).toBe(maxText);
    expect(mockCreateFirstTake.mock.calls[0][1].quoteText).toHaveLength(MAX_REACTION);
  });
});

// ===========================================================================
// Rating granularity
// ===========================================================================
describe('FirstTakeSheet rating', () => {
  const increment = (utils: ReturnType<typeof render>) =>
    fireEvent(utils.getByLabelText('Rating'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
  const decrement = (utils: ReturnType<typeof render>) =>
    fireEvent(utils.getByLabelText('Rating'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

  it('starts unrated and keeps 0.1 granularity', () => {
    const utils = renderSheet();
    // Unrated: the big value renders an em dash, not a number.
    expect(utils.getByText('—')).toBeTruthy();

    increment(utils); // from the visual anchor of 5.0
    expect(utils.getByText('5.1')).toBeTruthy();
    increment(utils);
    expect(utils.getByText('5.2')).toBeTruthy();
    decrement(utils);
    expect(utils.getByText('5.1')).toBeTruthy();
  });

  it('clamps to the 1.0–10.0 range', () => {
    const utils = renderSheet();
    for (let i = 0; i < 60; i += 1) increment(utils);
    expect(utils.getByText('10.0')).toBeTruthy();
    for (let i = 0; i < 120; i += 1) decrement(utils);
    expect(utils.getByText('1.0')).toBeTruthy();
  });

  it('"Not rating this one" posts a null rating', async () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time')); // reaction → visibility
    tapContinue(utils); // visibility → summary
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].rating).toBeNull();
  });
});

// ===========================================================================
// Spoiler plumbing
// ===========================================================================
describe('FirstTakeSheet spoiler flag', () => {
  it('a spoiler chosen in the composer arrives in the created take', async () => {
    const utils = renderSheet();
    tapContinue(utils); // → reaction
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'The top never falls');
    tapContinue(utils); // → spoiler
    fireEvent.press(utils.getByText('Contains spoilers'));
    tapContinue(utils); // → visibility
    tapContinue(utils); // → summary
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].isSpoiler).toBe(true);
  });

  it('a wordless take is never a spoiler, even if the flag was set first', async () => {
    // Deliberate rule (first-take-sheet.tsx:142) — there is nothing to blur, so
    // the flag would only mislabel the post. Diverges from FirstTakeModal /
    // MultiFirstTakeModal, which forward `isSpoiler` verbatim.
    const utils = renderSheet();
    tapContinue(utils); // → reaction
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'temp');
    tapContinue(utils); // → spoiler
    fireEvent.press(utils.getByText('Contains spoilers'));
    tapContinue(utils); // → visibility
    tapContinue(utils); // → summary

    // Step back to the reaction and clear the words.
    fireEvent.press(backButton(utils)); // summary → visibility
    fireEvent.press(backButton(utils)); // visibility → spoiler
    fireEvent.press(backButton(utils)); // spoiler → reaction
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), '   ');
    fireEvent.press(utils.getByText('Skip — no words this time'));
    tapContinue(utils);
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].isSpoiler).toBe(false);
  });
});

// ===========================================================================
// Visibility
// ===========================================================================
describe('FirstTakeSheet visibility', () => {
  it.each([
    ['public', 'Public'],
    ['followers_only', 'Followers'],
    ['private', 'Private'],
  ] as const)('seeds the wizard from the saved default %s', (dbValue, designLabel) => {
    const utils = renderSheet({ defaultVisibility: dbValue });
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time')); // → visibility

    // The skip affordance names the already-selected option.
    const skipLabels = {
      Public: 'Keep it public',
      Followers: 'Keep it followers-only',
      Private: 'Keep it private',
    } as const;
    expect(utils.getByText(skipLabels[designLabel])).toBeTruthy();
  });

  it('maps the chosen design key to the DB visibility value', async () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time')); // → visibility
    fireEvent.press(utils.getByText('Followers'));
    tapContinue(utils); // → summary
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].visibility).toBe('followers_only');
  });
});

// ===========================================================================
// Batch semantics
// ===========================================================================
describe('FirstTakeSheet batch semantics (SavedMovie[])', () => {
  it('runs one step-sequence per movie and commits each separately', async () => {
    const onDone = jest.fn();
    const utils = renderSheet({ movies: TWO, onDone });

    expect(utils.getByText('1 / 2')).toBeTruthy();
    expect(utils.getByText('Inception')).toBeTruthy();

    // Movie 1 — post with a rating only.
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Continue')); // visibility → summary
    fireEvent.press(utils.getByText('Post & next movie'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].tmdbId).toBe(27205);
    expect(onDone).not.toHaveBeenCalled();

    // Movie 2 — the wizard restarts at step 0 on a fresh, blank draft.
    await waitFor(() => expect(utils.getByText('2 / 2')).toBeTruthy());
    expect(utils.getByText('Interstellar')).toBeTruthy();
    expect(utils.getByText('—')).toBeTruthy(); // rating did not carry over

    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Continue'));
    fireEvent.press(utils.getByText('Post & finish'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(2));
    expect(mockCreateFirstTake.mock.calls[1][1].tmdbId).toBe(157336);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('per-movie drafts do not bleed into each other', async () => {
    const utils = renderSheet({ movies: TWO });
    tapContinue(utils); // → reaction
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'Movie one words');
    tapContinue(utils); // → spoiler
    tapContinue(utils); // → visibility
    tapContinue(utils); // → summary
    fireEvent.press(utils.getByText('Post & next movie'));

    await waitFor(() => expect(utils.getByText('2 / 2')).toBeTruthy());
    tapContinue(utils); // → reaction for movie 2
    expect(utils.getByPlaceholderText(REACTION_PLACEHOLDER).props.value).toBe('');
    expect(utils.getByText(`0/${MAX_REACTION}`)).toBeTruthy();
  });

  it('a duplicate on one movie is swallowed and the batch keeps moving', async () => {
    mockCreateFirstTake.mockRejectedValueOnce(new Error('DUPLICATE_FIRST_TAKE'));
    const utils = renderSheet({ movies: TWO });

    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Continue'));
    fireEvent.press(utils.getByText('Post & next movie'));

    await waitFor(() => expect(utils.getByText('2 / 2')).toBeTruthy());
    // A duplicate is expected traffic (re-scan of an already-taken ticket), so
    // it must not be reported as an error.
    expect(captureException).not.toHaveBeenCalled();
  });

  it('a real create failure is reported but still does not strand the batch', async () => {
    mockCreateFirstTake.mockRejectedValueOnce(new Error('network down'));
    const utils = renderSheet({ movies: TWO });

    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Continue'));
    fireEvent.press(utils.getByText('Post & next movie'));

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(utils.getByText('2 / 2')).toBeTruthy());
  });

  it('rapid double-submit commits exactly once (postingRef latch)', async () => {
    let release: (value: unknown) => void = () => {};
    mockCreateFirstTake.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const utils = renderSheet();

    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Continue')); // → summary

    const post = utils.getByText('Post First Take');
    fireEvent.press(post);
    fireEvent.press(post); // same-frame second tap

    expect(mockCreateFirstTake).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ id: 'take-1' });
    });
    expect(mockCreateFirstTake).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// Step flow
// ===========================================================================
describe('FirstTakeSheet step flow', () => {
  it('skips the spoiler step when the take has no words', () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Not rating this one'));
    expect(utils.getByText('2/5')).toBeTruthy(); // reaction

    fireEvent.press(utils.getByText('Skip — no words this time'));
    // Straight past the spoiler step (3/5) to visibility (4/5).
    expect(utils.getByText('4/5')).toBeTruthy();
    expect(utils.getByText('Who can see this?')).toBeTruthy();
  });

  it('Back mirrors the spoiler skip', () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time')); // → visibility (4/5)
    fireEvent.press(backButton(utils));
    expect(utils.getByText('2/5')).toBeTruthy();
    expect(utils.getByText('What was your first reaction?')).toBeTruthy();
  });

  it('an entirely skipped take still posts, with no rating and no words', async () => {
    const utils = renderSheet();
    fireEvent.press(utils.getByText('Not rating this one'));
    fireEvent.press(utils.getByText('Skip — no words this time'));
    fireEvent.press(utils.getByText('Keep it public'));
    fireEvent.press(utils.getByText('Skip for now'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1]).toMatchObject({
      rating: null,
      quoteText: '',
      isSpoiler: false,
      visibility: 'public',
      tmdbId: 27205,
      movieTitle: 'Inception',
    });
  });
});

// ===========================================================================
// DISCREPANCY — keyboard guard absent on this composer
// ===========================================================================
describe('FirstTakeSheet accidental-dismiss protection', () => {
  /**
   * DELIBERATELY RED. `modal_keyboard_guard` is at 100% and both other
   * composers implement the rule: with the keyboard up, a backdrop press drops
   * the keyboard instead of closing, so a swipe that starts on the backdrop
   * strip cannot wipe an in-progress draft.
   *
   * This sheet's backdrop is `onPress={onClose}` unconditionally
   * (first-take-sheet.tsx:221), and the reaction step `autoFocus`es its input
   * (line 304) — so the keyboard is up by construction on the exact step where
   * the user has typed something. Worse than the modals' version of this bug:
   * the only call site (scan-v2-flow.tsx:409-416) passes the SAME handler for
   * `onClose` and `onDone`, so the accidental press abandons every remaining
   * movie in the batch AND navigates away from the flow.
   *
   * No production fix is included here on purpose — this PR is tests only.
   * Flip this to `it` when the guard lands.
   */
  it.failing('guard: with the keyboard up, a backdrop press must not close the sheet', () => {
    const { Keyboard } = require('react-native');
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const onClose = jest.fn();

    const utils = renderSheet({ onClose });
    tapContinue(utils); // → reaction step (autoFocus, keyboard up)
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'half a thought');

    fireEvent.press(backdrop(utils));

    expect(dismiss).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('documents the shipped behavior: a backdrop press closes unconditionally', () => {
    const { Keyboard } = require('react-native');
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    const onClose = jest.fn();

    const utils = renderSheet({ onClose });
    tapContinue(utils);
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'half a thought');

    fireEvent.press(backdrop(utils));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the ✕ abandons the batch without committing anything', () => {
    const onClose = jest.fn();
    const utils = renderSheet({ movies: TWO, onClose });
    tapContinue(utils);
    fireEvent.changeText(utils.getByPlaceholderText(REACTION_PLACEHOLDER), 'words');

    fireEvent.press(closeButton(utils));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });
});
