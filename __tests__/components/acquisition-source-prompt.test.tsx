import { act, fireEvent, render } from '@testing-library/react-native';
import { AcquisitionSourcePrompt } from '@/components/acquisition-source-prompt';

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));

const onSelect = jest.fn();
const onClose = jest.fn();
const onDismiss = jest.fn();

function renderPrompt() {
  return render(
    <AcquisitionSourcePrompt
      visible
      onSelect={onSelect}
      onClose={onClose}
      onDismiss={onDismiss}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AcquisitionSourcePrompt — answer is persisted before the beat', () => {
  it('tapping a chip reports the source IMMEDIATELY, then closes after the beat', () => {
    const { getByLabelText, getByText } = renderPrompt();

    fireEvent.press(getByLabelText('Product Hunt'));

    // The answer must be on its way before the 1.4s thank-you plays — a
    // background/force-quit during the beat used to lose it entirely.
    expect(onSelect).toHaveBeenCalledWith('producthunt');
    expect(onClose).not.toHaveBeenCalled();
    expect(getByText('Noted — enjoy the show.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1400);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('skipping dismisses without reporting a source', () => {
    const { getByLabelText } = renderPrompt();

    fireEvent.press(getByLabelText('Skip'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
