import { render } from '@testing-library/react-native';
import { OutdatedBinaryNudgeCard } from '@/components/outdated-binary-nudge-card';
import { useOutdatedBinaryNudge } from '@/hooks/use-outdated-binary-nudge';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
jest.mock('@/hooks/use-outdated-binary-nudge', () => ({
  useOutdatedBinaryNudge: jest.fn(),
}));

const nudgeMock = useOutdatedBinaryNudge as jest.Mock;
const onDismiss = jest.fn();
const onUpdate = jest.fn();

function mockTier(tier: 'none' | 'recommended' | 'minimum') {
  nudgeMock.mockReturnValue({
    tier,
    targetVersion: tier === 'none' ? null : '1.6.1',
    onDismiss,
    onUpdate,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OutdatedBinaryNudgeCard', () => {
  it('renders nothing at all when the binary is current', () => {
    mockTier('none');
    const { toJSON } = render(<OutdatedBinaryNudgeCard />);
    // Null, not an empty wrapper — an empty View would leave a phantom gap in
    // the home stack between the header and the next card.
    expect(toJSON()).toBeNull();
  });

  it('renders the recommended copy with a dismiss affordance', () => {
    mockTier('recommended');
    const { queryByText, queryByLabelText } = render(<OutdatedBinaryNudgeCard />);

    expect(queryByText('A new cut is out')).not.toBeNull();
    expect(queryByText('UPDATE')).not.toBeNull();
    expect(queryByLabelText('Dismiss')).not.toBeNull();
  });

  it('renders the minimum tier with NO dismiss affordance', () => {
    mockTier('minimum');
    const { queryByText, queryByLabelText } = render(<OutdatedBinaryNudgeCard />);

    expect(queryByText('This version has retired')).not.toBeNull();
    // The minimum tier is the lever for a genuinely broken binary: persistent,
    // but still non-blocking — the user can scroll straight past it.
    expect(queryByLabelText('Dismiss')).toBeNull();
  });

  it('exposes the update action as a button on both tiers', () => {
    mockTier('recommended');
    const recommended = render(<OutdatedBinaryNudgeCard />);
    expect(recommended.queryByLabelText('Update PocketStubs')).not.toBeNull();

    mockTier('minimum');
    const minimum = render(<OutdatedBinaryNudgeCard />);
    expect(
      minimum.queryByLabelText('Update PocketStubs, this version is no longer supported')
    ).not.toBeNull();
  });
});
