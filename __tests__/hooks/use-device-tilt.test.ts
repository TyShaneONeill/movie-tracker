import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DeviceMotion } from 'expo-sensors';
import { useDeviceTilt } from '@/hooks/use-device-tilt';

// jest-expo's preset does not auto-mock react-native-reanimated. Provide a
// minimal mock for useSharedValue so the hook can run in the test env.
jest.mock('react-native-reanimated', () => ({
  useSharedValue: <T,>(initial: T) => ({ value: initial }),
}));

jest.mock('expo-sensors', () => {
  const subscribers: ((data: unknown) => void)[] = [];
  return {
    DeviceMotion: {
      isAvailableAsync: jest.fn().mockResolvedValue(true),
      setUpdateInterval: jest.fn(),
      addListener: jest.fn((cb: (data: unknown) => void) => {
        subscribers.push(cb);
        return {
          remove: jest.fn(() => {
            const idx = subscribers.indexOf(cb);
            if (idx >= 0) subscribers.splice(idx, 1);
          }),
        };
      }),
      __emit: (data: unknown) => subscribers.forEach((s) => s(data)),
      __subscriberCount: () => subscribers.length,
      __reset: () => {
        subscribers.length = 0;
      },
    },
  };
});

describe('useDeviceTilt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (DeviceMotion as unknown as { __reset: () => void }).__reset();
    (DeviceMotion.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  });

  it('subscribes on mount and unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useDeviceTilt());
    await waitFor(() => {
      expect(
        (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
      ).toBe(1);
    });
    unmount();
    await waitFor(() => {
      expect(
        (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
      ).toBe(0);
    });
  });

  it('updates gravity SharedValue when sensor emits', async () => {
    const { result } = renderHook(() => useDeviceTilt());
    await waitFor(() =>
      expect(
        (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
      ).toBe(1),
    );

    act(() => {
      (DeviceMotion as unknown as { __emit: (d: unknown) => void }).__emit({
        accelerationIncludingGravity: { x: 0, y: -9.8, z: 0 },
        rotation: { alpha: 0, beta: 0, gamma: 0 },
      });
    });

    expect(result.current.gravity.value.gx).toBeCloseTo(0, 1);
    expect(result.current.gravity.value.gy).toBeCloseTo(1, 1); // +y is "down" on screen
  });

  it('queues a jump event when accelerationIncludingGravity.z spikes above threshold', async () => {
    const { result } = renderHook(() => useDeviceTilt({ jumpThreshold: 1.4 }));
    await waitFor(() =>
      expect(
        (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
      ).toBe(1),
    );

    // First emit: at-rest gravity
    act(() => {
      (DeviceMotion as unknown as { __emit: (d: unknown) => void }).__emit({
        accelerationIncludingGravity: { x: 0, y: 0, z: -9.8 },
      });
    });
    expect(result.current.jumpQueue.value.length).toBe(0);

    // Second emit: vertical spike (e.g., user jumps holding phone) — z magnitude jumps
    act(() => {
      (DeviceMotion as unknown as { __emit: (d: unknown) => void }).__emit({
        accelerationIncludingGravity: { x: 0, y: 0, z: -25 }, // spike
      });
    });
    expect(result.current.jumpQueue.value.length).toBe(1);
    expect(result.current.jumpQueue.value[0].magnitude).toBeGreaterThan(1.4);
  });

  it('caps jumpQueue at JUMP_QUEUE_MAX entries to prevent unbounded growth', async () => {
    const { result } = renderHook(() => useDeviceTilt({ jumpThreshold: 1.4 }));
    await waitFor(() =>
      expect(
        (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
      ).toBe(1),
    );

    // Alternate z between a large magnitude and ~0 so every per-frame delta
    // crosses the 1.4g threshold (|30 - 0|/9.8 ≈ 3.06 > 1.4).
    act(() => {
      for (let i = 0; i < 20; i++) {
        const z = i % 2 === 0 ? 30 : 0;
        (DeviceMotion as unknown as { __emit: (d: unknown) => void }).__emit({
          accelerationIncludingGravity: { x: 0, y: 0, z },
        });
      }
    });

    // 20 events emitted with no consumer drain — the cap (16) must hold.
    expect(result.current.jumpQueue.value.length).toBeLessThanOrEqual(16);
  });

  it('returns no-op SharedValues when DeviceMotion.isAvailableAsync resolves false', async () => {
    (DeviceMotion.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useDeviceTilt());
    await new Promise((r) => setTimeout(r, 50));
    expect(
      (DeviceMotion as unknown as { __subscriberCount: () => number }).__subscriberCount(),
    ).toBe(0);
    expect(result.current.gravity.value.gx).toBe(0);
    expect(result.current.gravity.value.gy).toBe(1); // identity = straight down
  });
});
