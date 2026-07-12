import { render } from '@testing-library/react-native';
import { MurmurLine } from '@/components/feed-v2/murmur-line';
import type { FeedMurmur } from '@/lib/feed-v2-logic';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ analytics: { track: jest.fn() } }));

const SPOILER_BODY = 'the twist is that he was dead the whole time';

function murmur(over: Partial<FeedMurmur> = {}): FeedMurmur {
  return {
    id: 'c1',
    commenterUserId: 'u',
    commenterName: 'marcus',
    commenterAvatarUrl: null,
    ownerName: 'jess',
    ownerType: 'take',
    body: SPOILER_BODY,
    isSpoiler: false,
    createdAt: '2026-07-12T00:00:00Z',
    targetType: 'first_take',
    targetId: 'a1',
    tmdbId: 1,
    mediaType: 'movie',
    ...over,
  };
}

describe('MurmurLine — spoiler comments never leak the body', () => {
  it('shows "Contains spoilers" and hides the body for an attached top-comment murmur', () => {
    const { queryByText } = render(<MurmurLine murmur={murmur({ isSpoiler: true, ownerType: 'take' })} />);
    expect(queryByText('Contains spoilers')).not.toBeNull();
    expect(queryByText(/he was dead/)).toBeNull();
  });

  it('shows "Contains spoilers" and hides the body for a standalone comment murmur', () => {
    const { queryByText } = render(<MurmurLine murmur={murmur({ isSpoiler: true, ownerType: 'review' })} />);
    expect(queryByText('Contains spoilers')).not.toBeNull();
    expect(queryByText(/he was dead/)).toBeNull();
  });

  it('renders the quoted body when the comment is not a spoiler', () => {
    const { queryByText } = render(<MurmurLine murmur={murmur({ isSpoiler: false })} />);
    expect(queryByText(/he was dead/)).not.toBeNull();
    expect(queryByText('Contains spoilers')).toBeNull();
  });
});
