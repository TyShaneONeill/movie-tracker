/**
 * Composer parity: every First Take composer must offer the SAME character
 * budget, and the watched chooser must not describe either option's visibility.
 *
 * Both invariants come from real device reports:
 *   - Scanning a ticket allowed 280 characters while marking the SAME title
 *     watched from its detail page allowed 140. Same action, half the room.
 *     The split appeared when ticket_scan_v2 was stripped (2026-07-18) and only
 *     the scanner moved to FirstTakeSheet.
 *   - The chooser told users First Take is "shared with the community" and a
 *     Review is one you "share only if you choose". Neither is true: both
 *     composers default to `preferences?.reviewVisibility ?? 'public'` and
 *     either can be set to public, followers-only, or private.
 *
 * Both are the kind of drift that reads as fine in a diff and only shows up
 * when someone uses two surfaces back to back, so they are pinned here.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('@/lib/theme-context', () => ({ useTheme: () => ({ effectiveTheme: 'light' }) }));
jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: { reviewVisibility: 'public' } }),
}));

import { FirstTakeModal } from '@/components/first-take-modal';
import { WatchedComposerChooser } from '@/components/watched-composer-chooser';

/** The shared budget. Raising this means raising it in ALL THREE composers. */
const EXPECTED_MAX = 280;

describe('First Take character budget', () => {
  it(`FirstTakeModal (detail pages, Debrief Rooms, import) offers ${EXPECTED_MAX}`, () => {
    const { getByText } = render(
      <FirstTakeModal visible onClose={jest.fn()} movieTitle="Inception" onSubmit={jest.fn()} />,
    );
    // The composer renders a live "<used>/<max>" counter.
    expect(getByText(`0/${EXPECTED_MAX}`)).toBeTruthy();
  });

  it('the scanner sheet and both modals declare the same limit', () => {
    // Read the constants from source rather than rendering the scanner, which
    // needs native camera modules. The point of the test is that three
    // independently-declared numbers agree; comparing the declarations is the
    // most direct expression of that.
    const { readFileSync } = require('node:fs');
    const path = require('node:path');
    const read = (p: string) => readFileSync(path.join(__dirname, '../../', p), 'utf8');

    const limits = {
      'first-take-modal': /MAX_QUOTE_LENGTH = (\d+)/.exec(read('components/first-take-modal.tsx'))?.[1],
      'multi-first-take-modal': /MAX_QUOTE_LENGTH = (\d+)/.exec(
        read('components/multi-first-take-modal.tsx'),
      )?.[1],
      'scan-v2/first-take-sheet': /MAX_REACTION = (\d+)/.exec(
        read('components/scan-v2/first-take-sheet.tsx'),
      )?.[1],
    };

    expect(limits).toEqual({
      'first-take-modal': String(EXPECTED_MAX),
      'multi-first-take-modal': String(EXPECTED_MAX),
      'scan-v2/first-take-sheet': String(EXPECTED_MAX),
    });
  });
});

describe('WatchedComposerChooser copy', () => {
  const renderChooser = () =>
    render(
      <WatchedComposerChooser
        visible
        onClose={jest.fn()}
        onSelectFirstTake={jest.fn()}
        onSelectReview={jest.fn()}
      />,
    );

  it('describes the two options by length and deliberation', () => {
    const { getByText } = renderChooser();
    expect(getByText('A quick gut reaction, in a line or two')).toBeTruthy();
    expect(getByText('A longer, considered write-up')).toBeTruthy();
  });

  it('claims nothing about who will see either post', () => {
    // Guards the specific falsehood Ty caught on device. Visibility is chosen
    // inside whichever composer opens, and defaults identically for both, so any
    // privacy language on this sheet is a claim the product does not honour.
    const { queryByText, toJSON } = renderChooser();
    expect(queryByText(/shared with the community/i)).toBeNull();
    expect(queryByText(/share it only if you choose/i)).toBeNull();

    const rendered = JSON.stringify(toJSON());
    for (const forbidden of ['public', 'private', 'follower', 'everyone', 'only you']) {
      expect(rendered.toLowerCase()).not.toContain(forbidden);
    }
  });
});
