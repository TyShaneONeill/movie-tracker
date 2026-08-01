/**
 * `FirstTakeModal` behavioral contracts.
 *
 * The composer behind detail pages, Debrief/Episode Rooms, the TV Time import
 * bridge and the legacy single-scan path — the one composer with an EDIT mode
 * and the only one that carries episode scoping.
 *
 * Two existing suites already own part of this surface and are NOT duplicated
 * here:
 *   - `first-take-modal-keyboard-guard.test.tsx` — backdrop guard + draft
 *     survival keyed by title|season|episode.
 *   - `first-take-modal-rating.test.tsx` — the PS-12 null-rating edit path.
 *
 * What this suite adds: the 280-character budget enforced on the rendered
 * input, rating granularity, episode scoping in the submitted payload, spoiler
 * and visibility plumbing, the content-lock rules, and the submit gate.
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — mirrors the two existing FirstTakeModal suites
// ---------------------------------------------------------------------------
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

const mockPreferences = { reviewVisibility: 'public' as string };
jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: mockPreferences }),
}));

const mockGetFeatureFlag = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
    reloadFeatureFlags: jest.fn(),
  },
}));

import { FirstTakeModal } from '@/components/first-take-modal';

const MAX_QUOTE_LENGTH = 280;
const PLACEHOLDER = 'What did you think? No spoilers unless you toggle below...';

const renderModal = (props: Partial<React.ComponentProps<typeof FirstTakeModal>> = {}) => {
  const onSubmit = props.onSubmit ?? jest.fn().mockResolvedValue(undefined);
  const full = {
    visible: true,
    onClose: jest.fn(),
    movieTitle: 'Inception',
    ...props,
    onSubmit,
  } as React.ComponentProps<typeof FirstTakeModal>;
  return { ...render(<FirstTakeModal {...full} />), onSubmit: onSubmit as jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences.reviewVisibility = 'public';
  mockGetFeatureFlag.mockImplementation((flag: string) =>
    flag === 'modal_keyboard_guard' ? true : undefined,
  );
});

// ===========================================================================
// Character budget — the #762 parity contract, on the rendered input
// ===========================================================================
describe('FirstTakeModal character budget', () => {
  it(`enforces ${MAX_QUOTE_LENGTH} on the input itself, not just the counter`, () => {
    const utils = renderModal();
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.maxLength).toBe(MAX_QUOTE_LENGTH);
  });

  it('truncates paste-over-limit rather than accepting it', () => {
    const utils = renderModal();
    fireEvent.changeText(
      utils.getByPlaceholderText(PLACEHOLDER),
      'y'.repeat(MAX_QUOTE_LENGTH + 100),
    );
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toHaveLength(MAX_QUOTE_LENGTH);
    expect(utils.getByText(`${MAX_QUOTE_LENGTH}/${MAX_QUOTE_LENGTH}`)).toBeTruthy();
  });

  it('commits max-length text unchanged', async () => {
    const maxText = 'z'.repeat(MAX_QUOTE_LENGTH);
    const utils = renderModal();
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), maxText);
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].quoteText).toHaveLength(MAX_QUOTE_LENGTH);
  });
});

// ===========================================================================
// Rating
// ===========================================================================
describe('FirstTakeModal rating', () => {
  const slider = (utils: ReturnType<typeof render>) => utils.UNSAFE_getByType('Slider' as any);

  it('keeps 0.1 step granularity', () => {
    const utils = renderModal();
    expect(slider(utils).props.step).toBe(0.1);
    expect(slider(utils).props.maximumValue).toBe(10);
  });

  it('floors a below-1 drag at 1 despite the slider min of 0', () => {
    // The track starts at 0 so the thumb can reach the left edge, but a take is
    // never scored below 1.0 (`onValueChange` clamps).
    const utils = renderModal();
    expect(slider(utils).props.minimumValue).toBe(0);

    fireEvent(slider(utils), 'valueChange', 0);
    expect(utils.getByText('1')).toBeTruthy();
    fireEvent(slider(utils), 'valueChange', 0.4);
    expect(utils.getByText('1')).toBeTruthy();
  });

  it('carries the exact fractional rating into the payload', async () => {
    const utils = renderModal();
    fireEvent(slider(utils), 'valueChange', 7.3);
    expect(utils.getByText('7.3')).toBeTruthy();

    fireEvent.press(utils.getByText('Post First Take'));
    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].rating).toBe(7.3);
  });
});

// ===========================================================================
// Episode scoping — the contract the Episode Rooms work depends on
// ===========================================================================
describe('FirstTakeModal episode scoping', () => {
  it('forwards season/episode verbatim when launched from an episode context', async () => {
    const utils = renderModal({ seasonNumber: 4, episodeNumber: 13 });
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'Dinner party');
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0]).toMatchObject({
      seasonNumber: 4,
      episodeNumber: 13,
    });
  });

  it('carries season 0 (specials) rather than dropping it as falsy', async () => {
    const utils = renderModal({ seasonNumber: 0, episodeNumber: 2 });
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].seasonNumber).toBe(0);
  });

  it('leaves season/episode undefined for movie and show-level takes', async () => {
    const utils = renderModal();
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].seasonNumber).toBeUndefined();
    expect(utils.onSubmit.mock.calls[0][0].episodeNumber).toBeUndefined();
  });

  it('widens the spoiler warning for episode takes', () => {
    // An episode take travels beyond the watched-gated room, and room-mates may
    // not have watched past this episode — so the flag covers both directions.
    const movie = renderModal();
    expect(movie.getByText('Content hidden until tapped')).toBeTruthy();

    const episode = renderModal({ seasonNumber: 4, episodeNumber: 13 });
    expect(
      episode.getByText('For this episode or future episodes — hidden until tapped'),
    ).toBeTruthy();
  });
});

// ===========================================================================
// Payload plumbing
// ===========================================================================
describe('FirstTakeModal payload', () => {
  it('a spoiler set in the composer arrives in the payload', async () => {
    const utils = renderModal();
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'He was dead the whole time');
    fireEvent.press(utils.getByRole('switch'));
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].isSpoiler).toBe(true);
  });

  it('trims the quote before submitting', async () => {
    const utils = renderModal();
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), '   padded   ');
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].quoteText).toBe('padded');
  });

  it.each(['public', 'followers_only', 'private'])(
    'seeds visibility from the saved preference (%s)',
    async (pref) => {
      mockPreferences.reviewVisibility = pref;
      const utils = renderModal();
      fireEvent.press(utils.getByText('Post First Take'));

      await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
      expect(utils.onSubmit.mock.calls[0][0].visibility).toBe(pref);
    },
  );

  it('an explicit visibility choice overrides the seeded default', async () => {
    mockPreferences.reviewVisibility = 'public';
    const utils = renderModal();
    fireEvent.press(utils.getByText('Followers'));
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0].visibility).toBe('followers_only');
  });

  /**
   * DELIBERATELY RED — see the PR body ("Discrepancy 3").
   *
   * The other two composers each hold their own latch: MultiFirstTakeModal
   * owns `isSubmitting` as local state, and FirstTakeSheet has an explicit
   * `postingRef` (first-take-sheet.tsx:132). FirstTakeModal has neither — its
   * `isSubmitting` is a PROP, so nothing inside the component stops a second
   * press landing before the caller's mutation state has propagated back down.
   *
   * The DB unique index is the real backstop (a duplicate insert becomes
   * `DUPLICATE_FIRST_TAKE`), so the user-visible cost is a spurious error, not
   * a duplicate row. No production fix here — this PR is tests only. Flip to
   * `it` when an internal latch lands.
   */
  it.failing('rapid double-submit posts exactly once', async () => {
    let release: () => void = () => {};
    const onSubmit = jest.fn(() => new Promise<void>((resolve) => { release = () => resolve(); }));
    const utils = renderModal({ onSubmit });

    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'Once only');
    const button = utils.getByText('Post First Take');
    fireEvent.press(button);
    fireEvent.press(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('documents the shipped behavior: two same-frame presses both submit', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = renderModal({ onSubmit });

    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'Once only');
    const button = utils.getByText('Post First Take');
    fireEvent.press(button);
    fireEvent.press(button);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it('the caller CAN suppress a further press by driving isSubmitting', () => {
    // Which is where the protection currently lives: every call site passes a
    // mutation's pending flag. It only closes the window one render later.
    const { ActivityIndicator } = require('react-native');
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = renderModal({ onSubmit, isSubmitting: true });

    // The label is replaced by a spinner and the button no longer submits.
    expect(utils.queryByText('Post First Take')).toBeNull();
    expect(utils.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Submit gate
// ===========================================================================
describe('FirstTakeModal submit gate', () => {
  it('a rating alone is postable (no words required)', async () => {
    const utils = renderModal();
    fireEvent.press(utils.getByText('Post First Take'));
    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0]).toMatchObject({ rating: 5, quoteText: '' });
  });

  it('words alone are postable when the take has no rating', async () => {
    const utils = renderModal({
      isEditing: false,
      initialValues: { rating: null, quoteText: '', isSpoiler: false, visibility: 'public' },
    });
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), 'No score, just words');
    fireEvent.press(utils.getByText('Post First Take'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0]).toMatchObject({
      rating: null,
      quoteText: 'No score, just words',
    });
  });

  it('an empty take with no rating cannot be posted', () => {
    const utils = renderModal({
      isEditing: false,
      initialValues: { rating: null, quoteText: '', isSpoiler: false, visibility: 'public' },
    });
    fireEvent.press(utils.getByText('Post First Take'));
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('whitespace-only words do not satisfy the gate on their own', () => {
    const utils = renderModal({
      isEditing: false,
      initialValues: { rating: null, quoteText: '', isSpoiler: false, visibility: 'public' },
    });
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER), '     ');
    fireEvent.press(utils.getByText('Post First Take'));
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Edit + content lock (PS-12)
// ===========================================================================
describe('FirstTakeModal edit mode', () => {
  const editProps = {
    isEditing: true,
    initialValues: {
      rating: 7.5,
      quoteText: 'Held up on rewatch',
      isSpoiler: true,
      visibility: 'followers_only' as const,
    },
  };

  it('opens pre-filled and labels itself as an edit', () => {
    const utils = renderModal(editProps);
    expect(utils.getByText('Edit First Take')).toBeTruthy();
    expect(utils.getByText('Save')).toBeTruthy();
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.value).toBe('Held up on rewatch');
    expect(utils.getByText('7.5')).toBeTruthy();
  });

  it('keeps CREATE copy when a caller seeds values but declares it a create', () => {
    // The TV Time ink→take bridge seeds a rating but is still a first post.
    const utils = renderModal({
      isEditing: false,
      initialValues: { rating: 9, quoteText: '', isSpoiler: false, visibility: 'public' },
    });
    expect(utils.getByText('Your First Take')).toBeTruthy();
    expect(utils.getByText('Post First Take')).toBeTruthy();
  });

  it('content lock freezes the content fields but not visibility', () => {
    const utils = renderModal({ ...editProps, contentLocked: true });

    expect(utils.getByText('Editing is locked — you can still change who sees this.')).toBeTruthy();
    expect(utils.getByPlaceholderText(PLACEHOLDER).props.editable).toBe(false);
    expect(utils.UNSAFE_getByType('Slider' as any).props.disabled).toBe(true);
    expect(utils.getByRole('switch').props.accessibilityState.disabled).toBe(true);

    // Visibility pills stay live.
    fireEvent.press(utils.getByText('Private'));
    expect(utils.getByText('Save')).toBeTruthy();
  });

  it('a locked save sends the content fields unchanged with the new visibility', async () => {
    const utils = renderModal({ ...editProps, contentLocked: true });
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Save'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0]).toMatchObject({
      rating: 7.5,
      quoteText: 'Held up on rewatch',
      isSpoiler: true,
      visibility: 'private',
    });
  });

  it('a locked take with no rating and no words is still savable (visibility-only edit)', async () => {
    const utils = renderModal({
      isEditing: true,
      contentLocked: true,
      initialValues: { rating: null, quoteText: '', isSpoiler: false, visibility: 'public' },
    });
    fireEvent.press(utils.getByText('Private'));
    fireEvent.press(utils.getByText('Save'));

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalledTimes(1));
    expect(utils.onSubmit.mock.calls[0][0]).toMatchObject({
      rating: null,
      quoteText: '',
      visibility: 'private',
    });
  });
});

// ===========================================================================
// Draft survival — target switch mid-draft (extends the keyboard-guard suite)
// ===========================================================================
describe('FirstTakeModal draft survival on target change', () => {
  const baseProps = {
    visible: true,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
    movieTitle: 'The Office',
  };

  it('restores the draft when reopening for the SAME episode', () => {
    const props = { ...baseProps, seasonNumber: 4, episodeNumber: 13 };
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...props} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    rerender(<FirstTakeModal {...props} visible={false} />);
    rerender(<FirstTakeModal {...props} visible />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('Dinner party is peak Office');
  });

  it('drops the draft when the show-level target becomes an episode target', () => {
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'show-level thought');
    rerender(<FirstTakeModal {...baseProps} visible={false} />);
    rerender(<FirstTakeModal {...baseProps} visible seasonNumber={4} episodeNumber={13} />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });

  it('a mid-draft target switch without closing does not resurrect the old draft on reopen', () => {
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'thoughts about The Office');
    // Parent swaps the target while the modal stays open (no visible transition).
    rerender(<FirstTakeModal {...baseProps} movieTitle="Parks and Recreation" />);
    rerender(<FirstTakeModal {...baseProps} movieTitle="Parks and Recreation" visible={false} />);
    rerender(<FirstTakeModal {...baseProps} movieTitle="Parks and Recreation" visible />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });
});
