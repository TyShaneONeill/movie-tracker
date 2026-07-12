import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SpoilerRedaction } from '@/components/first-takes-v2/spoiler-redaction';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

describe('SpoilerRedaction — tap-to-reveal in place', () => {
  it('hides the quote behind the redaction chip until tapped', () => {
    const { queryByText, getByLabelText } = render(
      <SpoilerRedaction>
        <Text>He was drowning the whole time</Text>
      </SpoilerRedaction>
    );

    // Redacted by default: chip visible, quote withheld.
    expect(queryByText('SPOILER · TAP TO REVEAL')).not.toBeNull();
    expect(queryByText('He was drowning the whole time')).toBeNull();

    // Tapping the chip reveals the quote in place and drops the chip.
    fireEvent.press(getByLabelText('Spoiler, tap to reveal'));
    expect(queryByText('He was drowning the whole time')).not.toBeNull();
    expect(queryByText('SPOILER · TAP TO REVEAL')).toBeNull();
  });
});
