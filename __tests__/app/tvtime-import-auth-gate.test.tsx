import { render, waitFor } from '@testing-library/react-native';

import TvTimeImportRoute from '@/app/settings/tvtime-import';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-tvtime-import', () => ({ useTvTimeImportGate: jest.fn() }));

// Keep the lazy import light — the gate never renders it in the cases we assert.
jest.mock('@/components/tvtime-import/tvtime-import-screen', () => {
  const { View } = require('react-native');
  return { TvTimeImportScreen: () => <View testID="import-screen" /> };
});

const mockUseAuth = useAuth as jest.Mock;
const mockUseGate = useTvTimeImportGate as jest.Mock;
const mockReplace = router.replace as jest.Mock;

describe('TvTimeImportRoute auth gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGate.mockReturnValue({ enabled: true, resolving: false });
  });

  it('auth resolved with NO user → redirects to sign-in (never shows the flow)', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    const { queryByTestId } = render(<TvTimeImportRoute />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/signin'));
    expect(queryByTestId('import-screen')).toBeNull();
  });

  it('auth still loading → holds a neutral screen, no redirect', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    const { queryByTestId } = render(<TvTimeImportRoute />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryByTestId('import-screen')).toBeNull();
  });

  it('signed-in user + flag ON → does NOT bounce to sign-in or settings', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    render(<TvTimeImportRoute />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/signin');
      expect(mockReplace).not.toHaveBeenCalledWith('/settings');
    });
  });

  it('signed-in user + flag OFF → bounces to settings (flag gate still holds)', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, isLoading: false });
    mockUseGate.mockReturnValue({ enabled: false, resolving: false });
    render(<TvTimeImportRoute />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/settings'));
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/signin');
  });
});
