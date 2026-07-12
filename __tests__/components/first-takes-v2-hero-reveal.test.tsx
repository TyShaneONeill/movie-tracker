import { render, fireEvent } from '@testing-library/react-native';
import { FirstTakesTab } from '@/components/first-takes-v2/first-takes-tab';
import type { FirstTake } from '@/lib/database.types';

// The hero pulls in native-backed children; stub them so the tab renders in jsdom.
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
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

function spoilerTake(id: string, quote: string): FirstTake {
  return {
    id,
    user_id: 'u1',
    tmdb_id: 1,
    movie_title: `Movie ${id}`,
    show_name: null,
    poster_path: '/p.jpg',
    reaction_emoji: '🤯',
    quote_text: quote,
    rating: null,
    is_spoiler: true,
    is_rewatch: false,
    media_type: 'movie',
    season_number: null,
    episode_number: null,
    edited_at: null,
    like_count: null,
    comment_count: null,
    title: null,
    visibility: 'public',
    created_at: '2026-07-11T00:00:00Z',
    updated_at: null,
  } as FirstTake;
}

const QUOTE_A = 'The twin brothers were the whole trick';
const QUOTE_B = 'Rosebud was the sled the entire time';

const props = {
  loading: false,
  error: false,
  isOwn: true,
  onRetry: () => {},
  onPressTake: () => {},
};

describe('FirstTakesTab — hero spoiler reveal does not persist across hero changes', () => {
  it('re-redacts when the latest take is replaced by a different spoiler take', () => {
    const { queryByText, getByLabelText, rerender } = render(
      <FirstTakesTab takes={[spoilerTake('a', QUOTE_A)]} {...props} />
    );

    // Redacted by default.
    expect(queryByText(QUOTE_A)).toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();

    // Reveal it in place.
    fireEvent.press(getByLabelText('Spoiler, tap to reveal'));
    expect(queryByText(QUOTE_A)).not.toBeNull();

    // Swap the hero for a DIFFERENT spoiler take (e.g. scope switch / refetch).
    // The key={hero.id} remounts HeroTake so the new spoiler starts redacted —
    // without it, React reconciles by position and the reveal would leak.
    rerender(<FirstTakesTab takes={[spoilerTake('b', QUOTE_B)]} {...props} />);

    expect(queryByText(QUOTE_B)).toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();
  });
});
