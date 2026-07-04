import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStatsDensity, STATS_DENSITY_STORAGE_KEY } from '@/hooks/use-stats-density';

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('useStatsDensity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it('defaults to compact', async () => {
    const { result } = renderHook(() => useStatsDensity());
    expect(result.current.density).toBe('compact');
    expect(result.current.compact).toBe(true);
    await waitFor(() => expect(mockGetItem).toHaveBeenCalledWith(STATS_DENSITY_STORAGE_KEY));
    expect(result.current.density).toBe('compact');
  });

  it('hydrates a stored "detailed" choice', async () => {
    mockGetItem.mockResolvedValue('detailed');
    const { result } = renderHook(() => useStatsDensity());
    await waitFor(() => expect(result.current.density).toBe('detailed'));
    expect(result.current.compact).toBe(false);
  });

  it('ignores unknown stored values and stays compact', async () => {
    mockGetItem.mockResolvedValue('bogus');
    const { result } = renderHook(() => useStatsDensity());
    await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
    expect(result.current.density).toBe('compact');
  });

  it('a toggle made before hydration resolves wins over the stored value', async () => {
    let resolveGet!: (value: string) => void;
    mockGetItem.mockReturnValue(new Promise<string>((resolve) => (resolveGet = resolve)));
    const { result } = renderHook(() => useStatsDensity());

    // User lands on compact after a double toggle, then stale hydration arrives.
    act(() => result.current.toggleDensity());
    act(() => result.current.toggleDensity());
    expect(result.current.density).toBe('compact');

    await act(async () => {
      resolveGet('detailed');
    });
    expect(result.current.density).toBe('compact');
  });

  it('toggle flips the density and persists it', async () => {
    const { result } = renderHook(() => useStatsDensity());
    await waitFor(() => expect(mockGetItem).toHaveBeenCalled());

    act(() => result.current.toggleDensity());
    expect(result.current.density).toBe('detailed');
    expect(mockSetItem).toHaveBeenCalledWith(STATS_DENSITY_STORAGE_KEY, 'detailed');

    act(() => result.current.toggleDensity());
    expect(result.current.density).toBe('compact');
    expect(mockSetItem).toHaveBeenCalledWith(STATS_DENSITY_STORAGE_KEY, 'compact');
  });
});
