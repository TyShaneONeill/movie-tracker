import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAcquisitionPrompt } from '@/hooks/use-acquisition-prompt';
import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';

// AsyncStorage and @/lib/sentry are mocked globally in __tests__/setup.ts.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), setPersonProperties: jest.fn() },
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const fromMock = supabase.from as jest.Mock;
const captureExceptionMock = captureException as jest.Mock;

const singleMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  getItemMock.mockResolvedValue(null); // not shown locally
  fromMock.mockReturnValue({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ single: singleMock })),
    })),
  });
});

describe('useAcquisitionPrompt — profile read', () => {
  it('reports the SELECT error to Sentry and stays hidden (missing-migration guard)', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'column profiles.acquisition_source does not exist' },
    });

    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalled());
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'column profiles.acquisition_source does not exist',
      }),
      { context: 'acquisition-prompt-profile-read' }
    );
    expect(result.current.visible).toBe(false);
  });

  it('does not query the profile at all when the local shown-flag is set', async () => {
    getItemMock.mockResolvedValue('true');

    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(fromMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
  });
});
