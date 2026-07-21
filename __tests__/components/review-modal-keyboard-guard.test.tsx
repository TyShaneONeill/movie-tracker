import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

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

jest.mock('@/components/ui/rating-slider', () => ({
  RatingSlider: () => null,
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: { reviewVisibility: 'public' } }),
}));

const mockGetFeatureFlag = jest.fn();
jest.mock('@/lib/analytics', () => ({
  analytics: {
    getFeatureFlag: (...args: unknown[]) => mockGetFeatureFlag(...args),
    reloadFeatureFlags: jest.fn(),
  },
}));

import { ReviewModal } from '@/components/review-modal';

const REVIEW_PLACEHOLDER = 'Write your detailed review...';

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

describe('ReviewModal keyboard guard (backdrop dismiss + draft)', () => {
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
    const { getByTestId } = render(<ReviewModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByTestId('review-backdrop'));

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('guard OFF: backdrop press closes even with keyboard visible (legacy behavior)', () => {
    setGuard(false);
    isVisibleSpy.mockReturnValue(true);
    const onClose = jest.fn();
    const { getByTestId } = render(<ReviewModal {...baseProps} onClose={onClose} />);

    fireEvent.press(getByTestId('review-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('guard ON: typed draft survives close → reopen for the same title', () => {
    setGuard(true);
    const { getByPlaceholderText, getByText, rerender } = render(<ReviewModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(REVIEW_PLACEHOLDER), 'A long, thoughtful review draft');
    fireEvent.press(getByText('✕'));
    rerender(<ReviewModal {...baseProps} visible={false} />);
    rerender(<ReviewModal {...baseProps} visible={true} />);

    expect(getByPlaceholderText(REVIEW_PLACEHOLDER).props.value).toBe(
      'A long, thoughtful review draft'
    );
  });

  it('guard ON: draft is dropped when reopening for a DIFFERENT title', () => {
    setGuard(true);
    const { getByPlaceholderText, rerender } = render(<ReviewModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(REVIEW_PLACEHOLDER), 'A long, thoughtful review draft');
    rerender(<ReviewModal {...baseProps} visible={false} />);
    rerender(<ReviewModal {...baseProps} visible={true} movieTitle="Parks and Recreation" />);

    expect(getByPlaceholderText(REVIEW_PLACEHOLDER).props.value).toBe('');
  });

  it('guard OFF: close → reopen wipes the draft (legacy behavior)', () => {
    setGuard(false);
    const { getByPlaceholderText, rerender } = render(<ReviewModal {...baseProps} />);

    fireEvent.changeText(getByPlaceholderText(REVIEW_PLACEHOLDER), 'A long, thoughtful review draft');
    rerender(<ReviewModal {...baseProps} visible={false} />);
    rerender(<ReviewModal {...baseProps} visible={true} />);

    expect(getByPlaceholderText(REVIEW_PLACEHOLDER).props.value).toBe('');
  });
});
