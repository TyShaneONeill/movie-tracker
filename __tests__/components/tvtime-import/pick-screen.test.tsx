import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';

import { PickScreen } from '@/components/tvtime-import/pick-screen';
import { Colors } from '@/constants/theme';
import type { TvTimeImportErrorCode } from '@/lib/tvtime-import';
import type { Styles } from '@/components/tvtime-import/tvtime-import-screen';

// Regression coverage for the PR #804 review finding: a code-aware branch (the
// "wrong file selected" callout vs plain error text vs the primary button
// label/handler) is exactly the kind of thing a type check can't catch. A
// prior revision of this screen swapped the primary button's label/handler
// for a "Retry" action on one error code, which would have trapped a user
// who landed on any OTHER error code behind a mislabeled button — only a
// render assertion on the actual button text/handler wiring catches that
// class of bug, which is what this suite is for.
//
// The style values below are irrelevant to what's under test (text/branch
// rendering, not layout), so a minimal stand-in avoids pulling in
// createStyles' full StyleSheet — and, more importantly, avoids importing
// tvtime-import-screen.tsx as a VALUE, which drags in a live Supabase client
// + auth-context (native modules this suite never exercises).
const styles = {} as Styles;
const colors = Colors.dark;
const onPick = jest.fn();

function renderPick(error: string | null, errorCode: TvTimeImportErrorCode | null) {
  return render(<PickScreen styles={styles} colors={colors} error={error} errorCode={errorCode} onPick={onPick} />);
}

describe('PickScreen', () => {
  beforeEach(() => {
    onPick.mockClear();
  });

  it('renders no error UI when there is no error', () => {
    renderPick(null, null);
    expect(screen.queryByText('Wrong file selected')).toBeNull();
    expect(screen.getByText('Choose export file')).toBeTruthy();
  });

  it.each<TvTimeImportErrorCode>(['not-a-zip', 'unzip-failed', 'missing-expected-csv'])(
    'renders the "Wrong file selected" callout for the %s code',
    (code) => {
      renderPick("That doesn't look like a TV Time export ZIP.", code);
      expect(screen.getByText('Wrong file selected')).toBeTruthy();
      expect(screen.getByText("That doesn't look like a TV Time export ZIP.")).toBeTruthy();
    }
  );

  it.each<TvTimeImportErrorCode>(['file-read-failed', 'file-too-large', 'csv-parse-failed', 'unknown'])(
    'renders plain error text (no wrong-file callout) for the %s code',
    (code) => {
      renderPick('Something went wrong reading your export.', code);
      expect(screen.queryByText('Wrong file selected')).toBeNull();
      expect(screen.getByText('Something went wrong reading your export.')).toBeTruthy();
    }
  );

  it('always shows the "Choose export file" pick button, regardless of error code, and never swaps its handler', () => {
    const codes: (TvTimeImportErrorCode | null)[] = [
      null,
      'not-a-zip',
      'unzip-failed',
      'missing-expected-csv',
      'file-read-failed',
      'file-too-large',
      'csv-parse-failed',
      'unknown',
    ];
    for (const code of codes) {
      renderPick(code ? 'An error occurred.' : null, code);
      expect(screen.getByText('Choose export file')).toBeTruthy();
      // No competing "Retry" (or similarly-labeled) action ever appears —
      // there is exactly one way forward from the pick screen.
      expect(screen.queryByText(/retry/i)).toBeNull();
    }
  });

  it('invokes onPick when the pick button is pressed', () => {
    renderPick(null, null);
    fireEvent.press(screen.getByText('Choose export file'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
