import { renderHook } from '@testing-library/react-native';

const mockFlag = jest.fn();
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => mockFlag(name),
}));
let mockUserId: string | undefined = 'normal-user';
jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}));

import { useRecapVisible } from '@/hooks/use-recap-visible';

describe('useRecapVisible', () => {
  const ORIGINAL_DEV = (global as any).__DEV__;
  beforeEach(() => {
    mockFlag.mockReturnValue({ enabled: false, value: false, reload: jest.fn() });
    mockUserId = 'normal-user';
    process.env.EXPO_PUBLIC_DEV_USER_IDS = 'dev-1,dev-2';
    (global as any).__DEV__ = false;
  });
  afterAll(() => { (global as any).__DEV__ = ORIGINAL_DEV; });

  it('hidden for a normal user with flag OFF in production', () => {
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(false);
  });

  it('visible when the flag is ON', () => {
    mockFlag.mockReturnValue({ enabled: true, value: true, reload: jest.fn() });
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });

  it('visible for a dev user id even with flag OFF', () => {
    mockUserId = 'dev-2';
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });

  it('visible in __DEV__ builds regardless of flag/user', () => {
    (global as any).__DEV__ = true;
    const { result } = renderHook(() => useRecapVisible());
    expect(result.current).toBe(true);
  });
});
