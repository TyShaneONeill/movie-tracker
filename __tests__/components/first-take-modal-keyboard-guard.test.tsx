import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('@/lib/haptics', () => ({
  hapticImpact: jest.fn(),
  hapticNotification: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: { reviewVisibility: 'public' } }),
}));

// Flag value the guard hook reads; flipped per test.
const mockGetFeatureFlag = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
    reloadFeatureFlags: jest.fn(),
  },
}));

import { FirstTakeModal } from '@/components/first-take-modal';

const PLACEHOLDER = 'What did you think? No spoilers unless you toggle below...';

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn().mockResolvedValue(undefined),
  movieTitle: 'The Office',
};

const setGuard = (on: boolean) =>
  mockGetFeatureFlag.mockImplementation((flag: string) =>
    flag === 'modal_keyboard_guard' ? on : undefined
  );

describe('FirstTakeModal keyboard guard (backdrop dismiss)', () => {
  let isVisibleSpy: jest.SpyInstance;
  let dismissSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    isVisibleSpy = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    isVisibleSpy.mockRestore();
    dismissSpy.mockRestore();
  });

  it('guard ON + keyboard visible: backdrop press dismisses keyboard, does NOT close', () => {
    setGuard(true);
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const { getByTestId } = render(<FirstTakeModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByTestId('first-take-backdrop'));

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('guard ON + keyboard hidden: backdrop press closes the modal', () => {
    setGuard(true);
    isVisibleSpy.mockReturnValue(false);
    const onClose = jest.fn();
    const { getByTestId } = render(<FirstTakeModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByTestId('first-take-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('guard OFF: backdrop press closes even with keyboard visible (legacy behavior)', () => {
    setGuard(false);
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const { getByTestId } = render(<FirstTakeModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByTestId('first-take-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('guard ON: the ✕ button still closes with the keyboard up (explicit close)', () => {
    setGuard(true);
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const { getByText } = render(<FirstTakeModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByText('✕'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('FirstTakeModal draft preservation across accidental close', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  it('guard ON: typed draft survives close → reopen for the same title', () => {
    setGuard(true);
    const { getByPlaceholderText, getByText, rerender } = render(<FirstTakeModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    // Real close path: handleClose (the state wipe lives there), then hidden.
    fireEvent.press(getByText('✕'));
    rerender(<FirstTakeModal {...baseProps} visible={false} />);
    rerender(<FirstTakeModal {...baseProps} visible={true} />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('Dinner party is peak Office');
  });

  it('guard ON: draft is dropped when reopening for a DIFFERENT title', () => {
    setGuard(true);
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    rerender(<FirstTakeModal {...baseProps} visible={false} />);
    rerender(<FirstTakeModal {...baseProps} visible={true} movieTitle="Parks and Recreation" />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });

  it('guard ON: draft is dropped when reopening for a different episode of the same show', () => {
    setGuard(true);
    const episodeProps = { ...baseProps, seasonNumber: 4, episodeNumber: 13 };
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...episodeProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    rerender(<FirstTakeModal {...episodeProps} visible={false} />);
    rerender(
      <FirstTakeModal {...baseProps} visible={true} seasonNumber={4} episodeNumber={14} />
    );

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });

  it('guard ON: successful submit clears the draft for the next open', async () => {
    setGuard(true);
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByPlaceholderText, getByText, rerender } = render(
      <FirstTakeModal {...baseProps} onSubmit={onSubmit} />
    );

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    fireEvent.press(getByText('Post First Take'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    rerender(<FirstTakeModal {...baseProps} onSubmit={onSubmit} visible={false} />);
    rerender(<FirstTakeModal {...baseProps} onSubmit={onSubmit} visible={true} />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });

  it('guard OFF: close → reopen wipes the draft (legacy behavior)', () => {
    setGuard(false);
    const { getByPlaceholderText, rerender } = render(<FirstTakeModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'Dinner party is peak Office');
    rerender(<FirstTakeModal {...baseProps} visible={false} />);
    rerender(<FirstTakeModal {...baseProps} visible={true} />);

    expect(getByPlaceholderText(PLACEHOLDER).props.value).toBe('');
  });
});
