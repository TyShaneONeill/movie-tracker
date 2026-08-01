/**
 * `MultiFirstTakeModal` behavioral contracts.
 *
 * The legacy batch-scan composer (`app/scan/review.tsx` when 2+ tickets save).
 * It had no direct coverage before this suite, which matters because it is the
 * one composer that commits a WHOLE BATCH — an accidental dismiss here costs
 * the user every remaining movie, not one draft.
 *
 * Contracts pinned here:
 *   - 280-character budget (parity with the other two composers, PR #762).
 *   - Rating slider: 0.1 step, floored at 1.
 *   - Keyboard guard: a backdrop press with the keyboard up must NOT abandon
 *     the batch (`modal_keyboard_guard`, now at 100%).
 *   - The ✕ asks before abandoning; it does not silently drop the batch.
 *   - Per-item submission: one `createFirstTake` per movie, form resets
 *     between movies, progress advances.
 *   - `DUPLICATE_FIRST_TAKE` surfaces as "Already Reviewed" and advances; any
 *     other failure keeps the user on the current movie so nothing is lost.
 *   - Spoiler + visibility chosen in the composer reach the created take.
 */
import React from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — mirrors __tests__/components/first-take-modal-keyboard-guard.test.tsx
// ---------------------------------------------------------------------------
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

const mockPreferences = { reviewVisibility: 'public' as string };
jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: mockPreferences }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockCreateFirstTake = jest.fn();
jest.mock('@/lib/first-take-service', () => ({
  createFirstTake: (...args: unknown[]) => mockCreateFirstTake(...args),
}));

// Flag value the keyboard guard reads; flipped per test.
const mockGetFeatureFlag = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
    reloadFeatureFlags: jest.fn(),
  },
}));

import { MultiFirstTakeModal, type MovieInfo } from '@/components/multi-first-take-modal';

const MAX_QUOTE_LENGTH = 280;
const PLACEHOLDER = 'What did you think? No spoilers unless you toggle below...';

const TWO: MovieInfo[] = [
  { tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' },
  { tmdbId: 157336, title: 'Interstellar', posterPath: '/b.jpg' },
];

const setGuard = (on: boolean) =>
  mockGetFeatureFlag.mockImplementation((flag: string) =>
    flag === 'modal_keyboard_guard' ? on : undefined,
  );

const renderModal = (movies: MovieInfo[] = TWO, onComplete = jest.fn()) => ({
  ...render(<MultiFirstTakeModal visible movies={movies} onComplete={onComplete} />),
  onComplete,
});

/** Fill in a postable take for the current movie (Multi requires BOTH). */
const fillTake = (utils: ReturnType<typeof render>, text: string) => {
  fireEvent(utils.UNSAFE_getByType('Slider' as any), 'valueChange', 8.5);
  fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), text);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences.reviewVisibility = 'public';
  setGuard(true);
  mockCreateFirstTake.mockResolvedValue({ id: 'take-1' });
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ===========================================================================
// Character budget — the #762 parity contract
// ===========================================================================
describe('MultiFirstTakeModal character budget', () => {
  it(`offers ${MAX_QUOTE_LENGTH}, matching the other two composers`, () => {
    const utils = renderModal();
    expect(utils.getByText(`0/${MAX_QUOTE_LENGTH}`)).toBeTruthy();
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.maxLength).toBe(MAX_QUOTE_LENGTH);
  });

  it('truncates paste-over-limit rather than accepting it', () => {
    const utils = renderModal();
    fireEvent.changeText(
      utils.getByPlaceholderText(PLACEHOLDER),
      'y'.repeat(MAX_QUOTE_LENGTH + 50),
    );
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toHaveLength(MAX_QUOTE_LENGTH);
    expect(utils.getByText(`${MAX_QUOTE_LENGTH}/${MAX_QUOTE_LENGTH}`)).toBeTruthy();
  });

  it('commits max-length text unchanged', async () => {
    const maxText = 'z'.repeat(MAX_QUOTE_LENGTH);
    const utils = renderModal();
    fillTake(utils, maxText);
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].quoteText).toHaveLength(MAX_QUOTE_LENGTH);
  });
});

// ===========================================================================
// Rating
// ===========================================================================
describe('MultiFirstTakeModal rating', () => {
  it('keeps 0.1 step granularity and floors at 1', () => {
    const utils = renderModal();
    const slider = utils.UNSAFE_getByType('Slider' as any);
    expect(slider.props.step).toBe(0.1);
    expect(slider.props.minimumValue).toBe(1);
    expect(slider.props.maximumValue).toBe(10);
  });

  it('renders a fractional rating to one decimal and a whole one without', () => {
    const utils = renderModal();
    const slider = utils.UNSAFE_getByType('Slider' as any);

    fireEvent(slider, 'valueChange', 7.3);
    expect(utils.getByText('7.3')).toBeTruthy();
    fireEvent(slider, 'valueChange', 8);
    expect(utils.getByText('8')).toBeTruthy();
  });

  it('carries the exact fractional rating into the created take', async () => {
    const utils = renderModal();
    fireEvent(utils.UNSAFE_getByType('Slider' as any), 'valueChange', 6.4);
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'Solid');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].rating).toBe(6.4);
  });
});

// ===========================================================================
// Accidental-dismiss protection — the batch is the thing at risk
// ===========================================================================
describe('MultiFirstTakeModal accidental-dismiss protection', () => {
  it('guard ON + keyboard up: a backdrop press drops the keyboard, keeps the batch', () => {
    (Keyboard.isVisible as jest.Mock).mockReturnValue(true);
    const utils = renderModal();

    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'half a thought');
    fireEvent.press(utils.getByTestId('multi-first-take-backdrop'));

    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(utils.onComplete).not.toHaveBeenCalled();
    // Draft intact, still on movie 1.
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toBe('half a thought');
    expect(utils.getByText('1 of 2')).toBeTruthy();
  });

  it('guard ON: the focused-input fallback covers a stale isVisible()=false', () => {
    // Android inside a Modal can report isVisible()=false with the IME up.
    (Keyboard.isVisible as jest.Mock).mockReturnValue(false);
    jest
      .spyOn(TextInput.State, 'currentlyFocusedInput')
      .mockReturnValue({} as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
    const utils = renderModal();

    fireEvent.press(utils.getByTestId('multi-first-take-backdrop'));

    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(utils.onComplete).not.toHaveBeenCalled();
  });

  it('guard ON + keyboard down: a backdrop press closes as before', () => {
    (Keyboard.isVisible as jest.Mock).mockReturnValue(false);
    const utils = renderModal();

    fireEvent.press(utils.getByTestId('multi-first-take-backdrop'));

    expect(utils.onComplete).toHaveBeenCalledTimes(1);
  });

  it('guard OFF: legacy behavior — the backdrop abandons the batch even mid-type', () => {
    setGuard(false);
    (Keyboard.isVisible as jest.Mock).mockReturnValue(true);
    const utils = renderModal();

    fireEvent.press(utils.getByTestId('multi-first-take-backdrop'));

    expect(utils.onComplete).toHaveBeenCalledTimes(1);
  });

  it('the ✕ confirms before abandoning the rest of the batch', () => {
    const utils = renderModal();
    fireEvent.press(utils.getByText('✕'));

    // Unlike FirstTakeModal's ✕ (an immediate close), this one is destructive
    // for every remaining movie, so it asks first.
    expect(utils.onComplete).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Skip All',
      'Skip First Takes for all 2 remaining movies?',
      expect.any(Array),
    );

    // Confirming runs the destructive action.
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    act(() => buttons.find((b: any) => b.style === 'destructive').onPress());
    expect(utils.onComplete).toHaveBeenCalledTimes(1);
  });

  it('the ✕ prompt counts only the REMAINING movies', async () => {
    const utils = renderModal();
    fillTake(utils, 'One down');
    fireEvent.press(utils.getByText('Next'));
    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());

    fireEvent.press(utils.getByText('✕'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Skip All',
      'Skip First Takes for all 1 remaining movies?',
      expect.any(Array),
    );
  });
});

// ===========================================================================
// Batch semantics
// ===========================================================================
describe('MultiFirstTakeModal batch semantics', () => {
  it('commits one take per movie and advances', async () => {
    const utils = renderModal();
    expect(utils.getByText('1 of 2')).toBeTruthy();
    expect(utils.getByText('Inception')).toBeTruthy();

    fillTake(utils, 'Dream logic, perfectly held');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][0]).toBe('user-1');
    expect(mockCreateFirstTake.mock.calls[0][1]).toMatchObject({
      tmdbId: 27205,
      movieTitle: 'Inception',
      posterPath: '/a.jpg',
      quoteText: 'Dream logic, perfectly held',
    });

    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());
    expect(utils.getByText('Interstellar')).toBeTruthy();
    expect(utils.onComplete).not.toHaveBeenCalled();

    fillTake(utils, 'The docking scene');
    fireEvent.press(utils.getByText('Done'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(2));
    expect(mockCreateFirstTake.mock.calls[1][1].tmdbId).toBe(157336);
    await waitFor(() => expect(utils.onComplete).toHaveBeenCalledTimes(1));
  });

  it('the form resets between movies — no draft bleed', async () => {
    const utils = renderModal();
    fillTake(utils, 'Movie one words');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
    expect(utils.getByText(`0/${MAX_QUOTE_LENGTH}`)).toBeTruthy();
    expect(utils.getByText('5')).toBeTruthy(); // rating back to the default
  });

  it('Skip advances without committing; Skip on the last movie finishes', async () => {
    const utils = renderModal();
    fireEvent.press(utils.getByText('Skip'));

    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());
    expect(mockCreateFirstTake).not.toHaveBeenCalled();

    fireEvent.press(utils.getByText('Skip'));
    expect(utils.onComplete).toHaveBeenCalledTimes(1);
    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });

  it('renders nothing when the batch is empty', () => {
    const utils = renderModal([]);
    expect(utils.toJSON()).toBeNull();
  });
});

// ===========================================================================
// Duplicate protection + failure handling
// ===========================================================================
describe('MultiFirstTakeModal duplicate + error handling', () => {
  it('a duplicate is explained and the batch advances', async () => {
    mockCreateFirstTake.mockRejectedValueOnce(new Error('DUPLICATE_FIRST_TAKE'));
    const utils = renderModal();

    fillTake(utils, 'Take two');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Already Reviewed',
        'You\'ve already posted a First Take for "Inception". Moving to next movie.',
        expect.any(Array),
      ),
    );
    // The advance happens on the OK press, not before it.
    expect(utils.getByText('1 of 2')).toBeTruthy();

    const okButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2];
    act(() => okButtons[0].onPress());
    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());
  });

  it('a non-duplicate failure keeps the user on the same movie with the draft intact', async () => {
    mockCreateFirstTake.mockRejectedValueOnce(new Error('network down'));
    const utils = renderModal();

    fillTake(utils, 'Do not lose this');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to save your First Take. Please try again.',
      ),
    );
    expect(utils.getByText('1 of 2')).toBeTruthy();
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toBe('Do not lose this');
  });
});

// ===========================================================================
// Payload plumbing
// ===========================================================================
describe('MultiFirstTakeModal payload', () => {
  it('a spoiler set in the composer arrives in the created take', async () => {
    const utils = renderModal();
    fillTake(utils, 'He was dead the whole time');
    fireEvent.press(utils.getByRole('switch'));
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].isSpoiler).toBe(true);
  });

  it('trims the quote before committing', async () => {
    const utils = renderModal();
    fillTake(utils, '   padded   ');
    fireEvent.press(utils.getByText('Next'));

    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].quoteText).toBe('padded');
  });

  it('seeds visibility from the saved preference and sends the chosen value', async () => {
    mockPreferences.reviewVisibility = 'private';
    const utils = renderModal();

    fillTake(utils, 'Just for me');
    fireEvent.press(utils.getByText('Next'));
    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
    expect(mockCreateFirstTake.mock.calls[0][1].visibility).toBe('private');

    // And an explicit choice overrides the seed on the next movie.
    await waitFor(() => expect(utils.getByText('2 of 2')).toBeTruthy());
    fillTake(utils, 'This one is public');
    fireEvent.press(utils.getByText('Public'));
    fireEvent.press(utils.getByText('Done'));
    await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(2));
    expect(mockCreateFirstTake.mock.calls[1][1].visibility).toBe('public');
  });
});

// ===========================================================================
// Submit gate
// ===========================================================================
describe('MultiFirstTakeModal submit gate', () => {
  it('a rating alone is NOT postable here — words are required', () => {
    // Documented discrepancy vs the other two composers, which both accept a
    // rating-only take. See the PR body.
    const utils = renderModal();
    fireEvent(utils.UNSAFE_getByType('Slider' as any), 'valueChange', 9);

    fireEvent.press(utils.getByText('Next'));
    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });

  it('whitespace-only words do not satisfy the gate', () => {
    const utils = renderModal();
    fillTake(utils, '     ');
    fireEvent.press(utils.getByText('Next'));
    expect(mockCreateFirstTake).not.toHaveBeenCalled();
  });
});
