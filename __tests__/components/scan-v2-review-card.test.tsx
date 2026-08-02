import React from 'react';
import { render } from '@testing-library/react-native';

import { ReviewCard } from '@/components/scan-v2/review-card';
import type { TicketVM, TicketReviewReason } from '@/lib/scan-v2/ticket-view-model';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

function vm(overrides: Partial<TicketVM> = {}): TicketVM {
  return {
    id: 'scan-1',
    status: 'review',
    confidence: 90,
    movie: { tmdbId: 550, title: 'Fight Club', posterPath: null },
    fields: { theater: 'AMC Metreon', date: 'Jul 20, 2026' },
    reviewReason: 'match_confidence',
    ...overrides,
  };
}

const renderCard = (ticket: TicketVM) =>
  render(
    <ReviewCard ticket={ticket} onSearch={jest.fn()} onRemove={jest.fn()} onEdit={jest.fn()} />
  );

describe('ReviewCard review copy', () => {
  it('keeps the confirm-the-match wording for an unsure match', () => {
    const { getByText } = renderCard(vm({ reviewReason: 'match_confidence' }));
    expect(getByText('Confirm match')).toBeTruthy();
    expect(getByText('Some fields had low confidence — give them a glance.')).toBeTruthy();
  });

  it('names the date — not the title — when the date is what is wrong', () => {
    const { getByText, queryByText } = renderCard(vm({ reviewReason: 'before_release' }));
    expect(getByText('That date is before this movie came out — give it a look.')).toBeTruthy();
    expect(getByText('Check date')).toBeTruthy();
    expect(queryByText('Confirm match')).toBeNull();
  });

  // The reason -> copy hop is the whole user-visible payload of #784: every
  // reason must produce distinct, non-empty wording and a date-pointing CTA.
  const dateReasons: TicketReviewReason[] = ['before_release', 'stale_past', 'future', 'unparseable'];

  it.each(dateReasons)('renders dedicated copy for %s', (reason) => {
    const { getByText } = renderCard(vm({ reviewReason: reason }));
    expect(getByText('Check date')).toBeTruthy();
  });

  it('gives every reason its own distinct note', () => {
    const notes = [...dateReasons, 'match_confidence' as const].map((reason) => {
      const { getByText } = renderCard(vm({ reviewReason: reason }));
      // The amber note is the only line ending in "look." or "glance."
      return getByText(/give (them|it) a (look|glance)\.$/).props.children;
    });
    expect(new Set(notes).size).toBe(notes.length);
  });

  it('falls back to the match copy when no reason is carried', () => {
    const { getByText } = renderCard(vm({ reviewReason: null }));
    expect(getByText('Confirm match')).toBeTruthy();
  });

  it('shows no review copy at all on a matched ticket', () => {
    const { queryByText, getByText } = renderCard(vm({ status: 'matched', reviewReason: null }));
    expect(queryByText('Confirm match')).toBeNull();
    expect(queryByText(/give (them|it) a (look|glance)\./)).toBeNull();
    expect(getByText('Edit')).toBeTruthy();
  });
});
