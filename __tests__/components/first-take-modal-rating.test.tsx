import React from 'react';
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

// The community slider isn't needed for these assertions; render nothing so it
// never fires an incidental onValueChange (which would set a numeric rating).
jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

jest.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({ preferences: { reviewVisibility: 'public' } }),
}));

import { FirstTakeModal } from '@/components/first-take-modal';

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  movieTitle: 'Inception',
};

describe('FirstTakeModal rating-null handling (PS-12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves a null rating on the EDIT path (does not coerce to 5)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <FirstTakeModal
        {...baseProps}
        onSubmit={onSubmit}
        isEditing
        initialValues={{ rating: null, quoteText: 'Loved it', isSpoiler: false, visibility: 'public' }}
      />
    );

    // Submit without touching the slider — a rating-less take must stay null.
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ rating: null, quoteText: 'Loved it' })
    );
  });

  it('keeps an existing numeric rating on the EDIT path', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <FirstTakeModal
        {...baseProps}
        onSubmit={onSubmit}
        isEditing
        initialValues={{ rating: 7, quoteText: 'Great', isSpoiler: false, visibility: 'public' }}
      />
    );

    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rating: 7 }));
  });

  it('CREATE path (no initialValues) still defaults the rating to 5', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <FirstTakeModal {...baseProps} onSubmit={onSubmit} />
    );

    // Create default rating (5) enables submit without any quote text.
    fireEvent.press(getByText('Post First Take'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rating: 5 }));
  });
});
