/**
 * The shared First Take composer contract.
 *
 * PocketStubs has THREE composers for the same user action — "leave a First
 * Take" — reached from different places:
 *
 *   FirstTakeModal        detail pages, Episode/Debrief Rooms, TV Time import,
 *                         legacy single scan; the only one with an edit mode
 *   MultiFirstTakeModal   legacy batch scan (2+ tickets in one go)
 *   FirstTakeSheet        the live scanner's 5-step wizard (highest traffic)
 *
 * They share no code, so parity is maintained by hand and drifts silently. It
 * has drifted before: the scanner allowed 280 characters while the detail page
 * allowed 140 for the same title, and nobody noticed until a user hit both
 * surfaces back to back (PR #762).
 *
 * This spec is the guard against the next such drift. Every contract below is
 * run against ALL THREE through a thin per-composer adapter, so a change that
 * only lands in one of them fails here rather than on someone's phone.
 *
 * Behaviour that legitimately differs (the wizard's skippable steps, the
 * batch-advance rules, edit mode, episode scoping) is NOT asserted here — it
 * lives in the three per-composer suites.
 *
 * This spec originally carried two divergences as deliberately-red tests: the
 * scanner sheet did not trim quotes, and the batch modal alone refused a
 * rating-only take. #778 closed both, so they are now ordinary shared
 * contracts inside the table below.
 *
 * NOTE ON VISIBILITY COPY: `first-take-composer-parity.test.tsx` forbids the
 * words public/private/follower/everyone/only-you in the WatchedComposerChooser,
 * because that sheet made a promise the product does not keep. That assertion
 * is deliberately not extended to the composers: each one legitimately renders
 * a visibility picker, so the same words are correct there.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

const mockPreferences = { reviewVisibility: 'public' as ReviewVisibility };
jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: mockPreferences }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockCreateFirstTake = jest.fn();
jest.mock('@/lib/first-take-service', () => ({
  createFirstTake: (...args: unknown[]) => mockCreateFirstTake(...args),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: { getFeatureFlag: () => true, reloadFeatureFlags: jest.fn() },
}));

import { FirstTakeModal } from '@/components/first-take-modal';
import { MultiFirstTakeModal } from '@/components/multi-first-take-modal';
import { FirstTakeSheet } from '@/components/scan-v2/first-take-sheet';

// ---------------------------------------------------------------------------
// The contract's shared vocabulary
// ---------------------------------------------------------------------------

/** The shared budget. Raising it means raising it in ALL THREE composers. */
const EXPECTED_MAX = 280;

/** Normalized shape of what a composer commits, whoever it hands it to. */
interface Committed {
  rating: number | null;
  quoteText: string;
  isSpoiler: boolean;
  visibility: ReviewVisibility;
}

interface Composer {
  utils: ReturnType<typeof render>;
  /** Navigate to the reaction field and return it. */
  reactionInput: () => any;
  /** Set a rating the composer will accept, then return the value it holds. */
  setRating: (value: number) => void;
  /** Declared / effective rating bounds and step. */
  ratingContract: () => { min: number; max: number; step: number };
  /** Flag the take as containing spoilers. */
  markSpoiler: () => void;
  /** Choose a visibility by its user-facing label. */
  chooseVisibility: (label: 'Public' | 'Followers' | 'Private') => void;
  /** Commit the take. */
  submit: () => void;
  /** What the composer actually committed. */
  committed: () => Promise<Committed>;
}

interface Adapter {
  name: string;
  mount: (defaultVisibility?: ReviewVisibility) => Composer;
}

const MODAL_PLACEHOLDER = 'What did you think? No spoilers unless you toggle below...';
const SHEET_PLACEHOLDER =
  'e.g. The IMAX sound design wrecked me — did not see that ending coming.';

// --- FirstTakeModal --------------------------------------------------------
const firstTakeModalAdapter: Adapter = {
  name: 'FirstTakeModal',
  mount: (defaultVisibility = 'public') => {
    mockPreferences.reviewVisibility = defaultVisibility;
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const utils = render(
      <FirstTakeModal visible onClose={jest.fn()} onSubmit={onSubmit} movieTitle="Inception" />,
    );
    const slider = () => utils.UNSAFE_getByType('Slider' as any);
    return {
      utils,
      reactionInput: () => utils.getByPlaceholderText(MODAL_PLACEHOLDER),
      setRating: (value) => fireEvent(slider(), 'valueChange', value),
      // Declares a 0 minimum so the thumb can reach the left edge, but the
      // change handler clamps to 1, so 1.0 is the effective floor.
      ratingContract: () => ({ min: 1, max: slider().props.maximumValue, step: slider().props.step }),
      markSpoiler: () => fireEvent.press(utils.getByRole('switch')),
      chooseVisibility: (label) => fireEvent.press(utils.getByText(label)),
      submit: () => fireEvent.press(utils.getByText('Post First Take')),
      committed: async () => {
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        return onSubmit.mock.calls[0][0] as Committed;
      },
    };
  },
};

// --- MultiFirstTakeModal ---------------------------------------------------
const multiFirstTakeModalAdapter: Adapter = {
  name: 'MultiFirstTakeModal',
  mount: (defaultVisibility = 'public') => {
    mockPreferences.reviewVisibility = defaultVisibility;
    const utils = render(
      <MultiFirstTakeModal
        visible
        movies={[{ tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' }]}
        onComplete={jest.fn()}
      />,
    );
    const slider = () => utils.UNSAFE_getByType('Slider' as any);
    return {
      utils,
      reactionInput: () => utils.getByPlaceholderText(MODAL_PLACEHOLDER),
      setRating: (value) => fireEvent(slider(), 'valueChange', value),
      // This one enforces its floor through the native slider's minimumValue
      // rather than a clamp in the handler, so the declared prop IS the bound.
      ratingContract: () => ({
        min: slider().props.minimumValue,
        max: slider().props.maximumValue,
        step: slider().props.step,
      }),
      markSpoiler: () => fireEvent.press(utils.getByRole('switch')),
      chooseVisibility: (label) => fireEvent.press(utils.getByText(label)),
      submit: () => fireEvent.press(utils.getByText('Done')),
      committed: async () => {
        await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
        return mockCreateFirstTake.mock.calls[0][1] as Committed;
      },
    };
  },
};

// --- FirstTakeSheet --------------------------------------------------------
const firstTakeSheetAdapter: Adapter = {
  name: 'FirstTakeSheet',
  mount: (defaultVisibility = 'public') => {
    const utils = render(
      <FirstTakeSheet
        userId="user-1"
        movies={[{ tmdbId: 27205, title: 'Inception', posterPath: '/a.jpg' }]}
        defaultVisibility={defaultVisibility}
        onClose={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    /** The wizard's header chevron — the only Pressable with hitSlop 6. */
    const pressBack = () => {
      const match = utils.UNSAFE_root.findAll(
        (node: any) =>
          typeof node.type === 'function' &&
          node.type.name === 'Pressable' &&
          node.props.hitSlop === 6,
      );
      if (match.length !== 1) throw new Error(`expected 1 back button, found ${match.length}`);
      fireEvent.press(match[0]);
    };
    /**
     * Unlike the two modals, which show every field at once, this composer is a
     * wizard — so the adapter walks to whichever step owns the field the
     * contract is asking about, in either direction.
     */
    const toRating = () => {
      while (!utils.queryByLabelText('Rating')) pressBack();
    };
    const track = () => {
      toRating();
      return utils.getByLabelText('Rating');
    };
    const nudge = (direction: 'increment' | 'decrement', times: number) => {
      const node = track();
      for (let i = 0; i < times; i += 1) {
        fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: direction } });
      }
    };
    /** Walk from wherever we are to the reaction step (step index 1). */
    const toReaction = () => {
      if (utils.queryByPlaceholderText(SHEET_PLACEHOLDER)) return;
      fireEvent.press(utils.getByText('Continue')); // rating → reaction
    };
    return {
      utils,
      reactionInput: () => {
        toReaction();
        return utils.getByPlaceholderText(SHEET_PLACEHOLDER);
      },
      // The wizard's slider is a custom control anchored at 5.0; step to the
      // requested value 0.1 at a time.
      setRating: (value) => {
        const delta = Math.round((value - 5) * 10);
        nudge(delta >= 0 ? 'increment' : 'decrement', Math.abs(delta));
      },
      ratingContract: () => {
        // Behavioural: walk to both extremes and read what the composer holds.
        nudge('increment', 60);
        const max = Number(utils.getByLabelText('Rating').props.accessibilityValue.now);
        nudge('decrement', 120);
        const min = Number(utils.getByLabelText('Rating').props.accessibilityValue.now);
        nudge('increment', 1);
        const step = Number(utils.getByLabelText('Rating').props.accessibilityValue.now) - min;
        return { min, max, step: Math.round(step * 10) / 10 };
      },
      markSpoiler: () => {
        toReaction();
        fireEvent.press(utils.getByText('Continue')); // reaction → spoiler
        fireEvent.press(utils.getByText('Contains spoilers'));
      },
      chooseVisibility: (label) => {
        // Drive forward to the visibility step (3) from wherever we are.
        while (!utils.queryByText('Who can see this?')) {
          fireEvent.press(utils.getByText('Continue'));
        }
        fireEvent.press(utils.getByText(label));
      },
      submit: () => {
        while (!utils.queryByText('Ready to post')) {
          fireEvent.press(utils.getByText('Continue'));
        }
        fireEvent.press(utils.getByText('Post First Take'));
      },
      committed: async () => {
        await waitFor(() => expect(mockCreateFirstTake).toHaveBeenCalledTimes(1));
        return mockCreateFirstTake.mock.calls[0][1] as Committed;
      },
    };
  },
};

const ADAPTERS = [firstTakeModalAdapter, multiFirstTakeModalAdapter, firstTakeSheetAdapter];

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferences.reviewVisibility = 'public';
  mockCreateFirstTake.mockResolvedValue({ id: 'take-1' });
});

// ===========================================================================
describe.each(ADAPTERS.map((a) => [a.name, a] as const))(
  'shared First Take composer contract: %s',
  (_name, adapter) => {
    // -- Character budget (the PR #762 regression) --------------------------
    it(`offers exactly ${EXPECTED_MAX} characters`, () => {
      const c = adapter.mount();
      expect(c.reactionInput().props.maxLength).toBe(EXPECTED_MAX);
      expect(c.utils.getByText(`0/${EXPECTED_MAX}`)).toBeTruthy();
    });

    it('shows a live counter as the user types', () => {
      const c = adapter.mount();
      fireEvent.changeText(c.reactionInput(), 'hello');
      expect(c.utils.getByText(`5/${EXPECTED_MAX}`)).toBeTruthy();
    });

    it('commits max-length text intact', async () => {
      const maxText = 'x'.repeat(EXPECTED_MAX);
      const c = adapter.mount();
      // Deliberate score before committing: FirstTakeModal's untouched-5 soft
      // confirm (2026-08-03 ruling) holds the first press otherwise. Harmless
      // on the other two composers, which start null and accept any score.
      c.setRating(7);
      fireEvent.changeText(c.reactionInput(), maxText);
      expect(c.utils.getByText(`${EXPECTED_MAX}/${EXPECTED_MAX}`)).toBeTruthy();

      c.submit();
      expect((await c.committed()).quoteText).toHaveLength(EXPECTED_MAX);
    });

    // -- Rating -------------------------------------------------------------
    it('keeps 0.1 rating granularity across the 1.0–10.0 range', () => {
      const c = adapter.mount();
      expect(c.ratingContract()).toEqual({ min: 1, max: 10, step: 0.1 });
    });

    it('carries a fractional rating through to the committed take', async () => {
      const c = adapter.mount();
      fireEvent.changeText(c.reactionInput(), 'Words, so every composer will accept this');
      c.setRating(7.3);
      c.submit();
      expect((await c.committed()).rating).toBeCloseTo(7.3, 5);
    });

    // -- Spoiler ------------------------------------------------------------
    it('a spoiler flagged in the composer arrives in the created take', async () => {
      const c = adapter.mount();
      c.setRating(7);
      fireEvent.changeText(c.reactionInput(), 'He was dead the whole time');
      c.markSpoiler();
      c.submit();
      expect((await c.committed()).isSpoiler).toBe(true);
    });

    it('defaults to not-a-spoiler', async () => {
      const c = adapter.mount();
      c.setRating(7);
      fireEvent.changeText(c.reactionInput(), 'Nothing given away here');
      c.submit();
      expect((await c.committed()).isSpoiler).toBe(false);
    });

    // -- Visibility ---------------------------------------------------------
    it.each(['public', 'followers_only', 'private'] as const)(
      'seeds visibility from the saved default (%s)',
      async (dbValue) => {
        const c = adapter.mount(dbValue);
        c.setRating(7);
        fireEvent.changeText(c.reactionInput(), 'Seeded default');
        c.submit();
        expect((await c.committed()).visibility).toBe(dbValue);
      },
    );

    it('honours an explicit visibility choice over the seeded default', async () => {
      const c = adapter.mount('public');
      c.setRating(7);
      fireEvent.changeText(c.reactionInput(), 'Explicit choice');
      c.chooseVisibility('Private');
      c.submit();
      expect((await c.committed()).visibility).toBe('private');
    });

    it('offers all three visibility options', () => {
      const c = adapter.mount();
      c.chooseVisibility('Public');
      expect(c.utils.getByText('Public')).toBeTruthy();
      expect(c.utils.getByText('Followers')).toBeTruthy();
      expect(c.utils.getByText('Private')).toBeTruthy();
    });

    // -- Parity restored by #778 --------------------------------------------
    // Both of these were per-composer divergences this suite found, and both
    // now hold everywhere, so they belong in the shared contract where a
    // regression in any one composer fails.

    it('trims the quote before committing', async () => {
      const c = adapter.mount();
      c.setRating(7);
      fireEvent.changeText(c.reactionInput(), '   padded   ');
      c.submit();
      expect((await c.committed()).quoteText).toBe('padded');
    });

    it('accepts a rating-only take, with no words', async () => {
      // Ty ruled 07-31 that rating-only takes are legitimate and accepted by
      // every composer; they are filtered out of public surfaces at DISPLAY
      // time instead (#779), not blocked at the point of creation.
      const c = adapter.mount();
      c.setRating(8);
      c.submit();
      expect((await c.committed()).quoteText).toBe('');
    });
  },
);

// ===========================================================================
// Source-level guard — catches a limit raised in one file only, even if the
// rendering assertions above are ever weakened or skipped.
// ===========================================================================
describe('character budget declarations', () => {
  it('all three composers declare the same limit', () => {
    const { readFileSync } = require('node:fs');
    const path = require('node:path');
    const read = (p: string) => readFileSync(path.join(__dirname, '../../', p), 'utf8');

    expect({
      'first-take-modal': /MAX_QUOTE_LENGTH = (\d+)/.exec(read('components/first-take-modal.tsx'))?.[1],
      'multi-first-take-modal': /MAX_QUOTE_LENGTH = (\d+)/.exec(
        read('components/multi-first-take-modal.tsx'),
      )?.[1],
      'scan-v2/first-take-sheet': /MAX_REACTION = (\d+)/.exec(
        read('components/scan-v2/first-take-sheet.tsx'),
      )?.[1],
    }).toEqual({
      'first-take-modal': String(EXPECTED_MAX),
      'multi-first-take-modal': String(EXPECTED_MAX),
      'scan-v2/first-take-sheet': String(EXPECTED_MAX),
    });
  });
});

// ===========================================================================
// A wordless take is never a spoiler.
//
// FirstTakeSheet has forced this since it shipped (first-take-sheet.tsx:142);
// #778 applied the same rule to both modals after QA created a real production
// row with `quote_text: ""` and `is_spoiler: true`. It is now a genuine shared
// rule, but each composer's version is already pinned individually — the two
// modals by __tests__/components/first-take-composer-parity-fixes.test.tsx
// (#778), the sheet by first-take-sheet-contracts.test.tsx in this PR — so it
// is referenced here rather than re-pinned a third time.
//
// What this spec does own is the other half of the rule, which no single-
// composer suite states as a parity contract: a take WITH words keeps its
// flag. That is asserted for all three by "a spoiler flagged in the composer
// arrives in the created take" above, which types words first by design.
// ===========================================================================
