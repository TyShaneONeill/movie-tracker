import { render, waitFor } from '@testing-library/react-native';

import TvTimeDeckRoute from '@/app/tvtime-deck';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportDeckGate } from '@/hooks/use-tvtime-deck';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-tvtime-deck', () => ({ useTvTimeImportDeckGate: jest.fn() }));

// Keep the deck screen light — the gate never renders it in the cases we assert.
jest.mock('@/components/tvtime-deck/deck-screen', () => {
  const { View } = require('react-native');
  return { TvTimeDeckScreen: () => <View testID="deck-screen" /> };
});

const mockUseAuth = useAuth as jest.Mock;
const mockUseGate = useTvTimeImportDeckGate as jest.Mock;
const mockReplace = router.replace as jest.Mock;

describe('TvTimeDeckRoute auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGate.mockReturnValue({ enabled: true, resolving: false });
  });

  it('auth resolved with NO user → redirects to sign-in (never shows the deck)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const { queryByTestId } = render(<TvTimeDeckRoute />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/signin'));
    expect(queryByTestId('deck-screen')).toBeNull();
  });

  it('auth still loading → holds a neutral screen, no redirect', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    const { queryByTestId } = render(<TvTimeDeckRoute />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryByTestId('deck-screen')).toBeNull();
  });

  it('signed-in user + flag ON → does NOT bounce to sign-in or home', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    render(<TvTimeDeckRoute />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/signin');
      expect(mockReplace).not.toHaveBeenCalledWith('/');
    });
  });

  it('signed-in user + flag OFF → bounces to home (flag gate still holds)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    mockUseGate.mockReturnValue({ enabled: false, resolving: false });
    render(<TvTimeDeckRoute />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/signin');
  });
});
