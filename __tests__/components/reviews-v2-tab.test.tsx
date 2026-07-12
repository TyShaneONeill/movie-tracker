import { render, fireEvent } from '@testing-library/react-native';
import { ReviewsTab } from '@/components/reviews-v2/reviews-tab';
import type { Review } from '@/lib/database.types';

// The cards pull in native-backed children; stub them so the tab renders in jsdom.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('@/components/like-button', () => ({ LikeButton: () => null }));
jest.mock('@/components/liked-by-indicator', () => ({ LikedByIndicator: () => null }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, Circle: View, Text };
});

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: overrides.id ?? 'r1',
    user_id: 'u1',
    tmdb_id: 1,
    movie_title: 'Dune: Part Two',
    poster_path: '/p.jpg',
    title: 'A headline',
    review_text: 'Body copy.',
    rating: 8,
    is_spoiler: false,
    is_rewatch: false,
    media_type: 'movie',
    visibility: 'public',
    edited_at: null,
    like_count: 0,
    comment_count: 0,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  } as Review;
}

const baseProps = {
  loading: false,
  error: false,
  isOwn: true,
  onRetry: () => {},
  onPressReview: () => {},
};

const BODY_A = 'He was the killer the whole time';
const BODY_B = 'The island was purgatory all along';

describe('ReviewsTab — spoiler reveal does not persist across a slot change', () => {
  it('re-redacts when a different review takes the same position', () => {
    const { queryByText, getByLabelText, rerender } = render(
      <ReviewsTab
        {...baseProps}
        reviews={[review({ id: 'a', is_spoiler: true, review_text: BODY_A })]}
      />
    );

    // Body redacted, headline visible.
    expect(queryByText(BODY_A)).toBeNull();
    expect(queryByText('A headline')).not.toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();

    // Reveal in place.
    fireEvent.press(getByLabelText('Spoiler, tap to reveal'));
    expect(queryByText(BODY_A)).not.toBeNull();

    // A DIFFERENT spoiler review slides into slot 0 (sort/scope change or
    // refetch). key={review.id} remounts the card so it starts redacted.
    rerender(
      <ReviewsTab
        {...baseProps}
        reviews={[review({ id: 'b', is_spoiler: true, review_text: BODY_B })]}
      />
    );

    expect(queryByText(BODY_B)).toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();
  });
});

describe('ReviewsTab — control line', () => {
  it('shows scope chips only when the user has BOTH media types', () => {
    const moviesOnly = render(
      <ReviewsTab
        {...baseProps}
        reviews={[review({ id: 'm1', media_type: 'movie' }), review({ id: 'm2', media_type: 'movie' })]}
      />
    );
    expect(moviesOnly.queryByText('Movies')).toBeNull();
    expect(moviesOnly.queryByText('TV')).toBeNull();

    const mixed = render(
      <ReviewsTab
        {...baseProps}
        reviews={[review({ id: 'm', media_type: 'movie' }), review({ id: 't', media_type: 'tv_show' })]}
      />
    );
    expect(mixed.getByText('Movies')).toBeTruthy();
    // The scope chip label 'All' also appears.
    expect(mixed.getByText('All')).toBeTruthy();
  });

  it('opens the sort sheet and echoes the selection into the trigger label', () => {
    const { getByText, queryByText, getByLabelText } = render(
      <ReviewsTab {...baseProps} reviews={[review({ id: 'a' }), review({ id: 'b' })]} />
    );

    // Default trigger label.
    expect(getByText('RECENT')).toBeTruthy();

    // Open the sheet — the four descriptor options appear.
    fireEvent.press(getByLabelText('Sort order, RECENT'));
    expect(getByText('the ones that hurt')).toBeTruthy();

    // Pick "Lowest" — the trigger echoes the new order.
    fireEvent.press(getByText('Lowest'));
    expect(getByText('LOWEST')).toBeTruthy();
    expect(queryByText('RECENT')).toBeNull();
  });
});

describe('ReviewsTab — states', () => {
  it('renders the own-profile empty CTA and routes it', () => {
    const onWriteReview = jest.fn();
    const { getByLabelText } = render(
      <ReviewsTab {...baseProps} reviews={[]} onWriteReview={onWriteReview} />
    );
    fireEvent.press(getByLabelText('Write a review'));
    expect(onWriteReview).toHaveBeenCalled();
  });

  it('omits the CTA for another user (not own)', () => {
    const { queryByLabelText } = render(
      <ReviewsTab {...baseProps} isOwn={false} reviews={[]} onWriteReview={() => {}} />
    );
    expect(queryByLabelText('Write a review')).toBeNull();
  });
});
