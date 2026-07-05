import { render } from '@testing-library/react-native';
import { EditedBadge } from '@/components/edited-badge';
import { formatFullTimestamp } from '@/lib/utils';

// @expo/vector-icons pulls in expo-asset which isn't transformed under jest.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Ionicons: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

describe('EditedBadge', () => {
  it('renders nothing when editedAt is null', () => {
    const { toJSON } = render(<EditedBadge editedAt={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when editedAt is undefined', () => {
    const { toJSON } = render(<EditedBadge editedAt={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it('renders an "Edited" label when editedAt is set', () => {
    const { queryByText } = render(<EditedBadge editedAt="2020-01-15T10:00:00Z" />);
    expect(queryByText(/Edited/)).not.toBeNull();
  });

  it('does not show the full-timestamp tooltip until expanded (no createdAt)', () => {
    const { queryByText } = render(<EditedBadge editedAt="2020-01-15T10:00:00Z" />);
    // Without createdAt the badge is not expandable, so no "Posted …" tooltip.
    expect(queryByText(/Posted/)).toBeNull();
  });
});

describe('formatFullTimestamp', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(formatFullTimestamp(null)).toBe('');
    expect(formatFullTimestamp(undefined)).toBe('');
    expect(formatFullTimestamp('')).toBe('');
  });

  it('returns empty string for an unparseable date', () => {
    expect(formatFullTimestamp('not-a-date')).toBe('');
  });

  it('formats a valid ISO date to a non-empty human string including the year', () => {
    const out = formatFullTimestamp('2020-01-15T10:00:00Z');
    expect(out).not.toBe('');
    expect(out).toContain('2020');
  });
});
