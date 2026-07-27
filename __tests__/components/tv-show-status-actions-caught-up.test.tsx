import React from 'react';
import { render } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

import { TvShowStatusActions } from '@/components/tv-show-status-actions';

describe('TvShowStatusActions — "Caught Up" label (N2)', () => {
  it('reads WATCHING when isCaughtUp is false', () => {
    const { getByText, queryByText } = render(
      <TvShowStatusActions
        currentStatus="watching"
        isCaughtUp={false}
        onStatusChange={jest.fn()}
      />
    );

    expect(getByText('WATCHING')).toBeTruthy();
    expect(queryByText('CAUGHT UP')).toBeNull();
  });

  it('reads CAUGHT UP when isCaughtUp is true and the show is watching', () => {
    const { getByText, queryByText } = render(
      <TvShowStatusActions
        currentStatus="watching"
        isCaughtUp={true}
        onStatusChange={jest.fn()}
      />
    );

    expect(getByText('CAUGHT UP')).toBeTruthy();
    expect(queryByText('WATCHING')).toBeNull();
  });

  it('does not relabel a non-watching status even if isCaughtUp is true (defensive — should not happen upstream)', () => {
    const { getByText } = render(
      <TvShowStatusActions
        currentStatus="watched"
        isCaughtUp={true}
        onStatusChange={jest.fn()}
      />
    );

    // The pill stays "WATCHING" — isCaughtUp only relabels the active WATCHING button.
    expect(getByText('WATCHING')).toBeTruthy();
  });

  it('defaults to WATCHING when isCaughtUp is omitted', () => {
    const { getByText } = render(
      <TvShowStatusActions currentStatus="watching" onStatusChange={jest.fn()} />
    );

    expect(getByText('WATCHING')).toBeTruthy();
  });
});
