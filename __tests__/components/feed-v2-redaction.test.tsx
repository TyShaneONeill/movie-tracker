import { render, fireEvent } from '@testing-library/react-native';
import { FeedArtifact } from '@/components/feed-v2/feed-artifact';
import type { ActivityFeedItem } from '@/hooks/use-activity-feed';

// FeedArtifact pulls native-backed children; stub them so it renders in jsdom.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
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
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));
jest.mock('@/components/ui/avatar', () => {
  const { View } = require('react-native');
  return { Avatar: View };
});
jest.mock('@/components/like-button', () => {
  const { View } = require('react-native');
  return { LikeButton: View };
});

function spoilerArtifact(id: string, quote: string): ActivityFeedItem {
  return {
    id,
    userId: 'u1',
    tmdbId: 1,
    movieTitle: `Movie ${id}`,
    posterPath: '/p.jpg',
    rating: null,
    quoteText: quote,
    isSpoiler: true,
    visibility: 'public',
    createdAt: '2026-07-12T00:00:00Z',
    mediaType: 'movie',
    userDisplayName: 'kelsie',
    userAvatarUrl: null,
    activityType: 'first_take',
    isRewatch: false,
  };
}

const QUOTE_A = 'He was drowning the whole time';
const QUOTE_B = 'Rosebud was the sled the entire time';

describe('FeedArtifact — spoiler reveal does not persist across artifact id changes', () => {
  it('re-redacts when a different spoiler artifact takes the same slot (#662 key-by-id)', () => {
    const { queryByText, getByLabelText, rerender } = render(
      <FeedArtifact item={spoilerArtifact('a', QUOTE_A)} timeLabel="1d" />
    );

    // Redacted by default: chip shown, quote withheld.
    expect(queryByText(QUOTE_A, { exact: false })).toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();

    // Reveal it in place.
    fireEvent.press(getByLabelText('Spoiler, tap to reveal'));
    expect(queryByText(QUOTE_A, { exact: false })).not.toBeNull();

    // Swap in a DIFFERENT spoiler artifact at this slot (refetch / new page). The
    // key={item.id} on SpoilerRedaction remounts it so the new spoiler starts
    // redacted — without it the reveal would leak to an unrelated take.
    rerender(<FeedArtifact item={spoilerArtifact('b', QUOTE_B)} timeLabel="2d" />);

    expect(queryByText(QUOTE_B, { exact: false })).toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();
  });
});

describe('FeedArtifact — moderation report affordance (compliance parity)', () => {
  it('shows a "…" menu on a non-own artifact and opens the report flow', () => {
    const onReport = jest.fn();
    const { getByLabelText } = render(
      <FeedArtifact item={spoilerArtifact('a', QUOTE_A)} timeLabel="1d" isOwn={false} onReport={onReport} />
    );
    fireEvent.press(getByLabelText('More options'));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('hides the "…" menu on the signed-in user\'s own artifact', () => {
    const onReport = jest.fn();
    const { queryByLabelText } = render(
      <FeedArtifact item={spoilerArtifact('a', QUOTE_A)} timeLabel="1d" isOwn onReport={onReport} />
    );
    expect(queryByLabelText('More options')).toBeNull();
  });
});
