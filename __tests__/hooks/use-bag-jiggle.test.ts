import { renderHook, act } from '@testing-library/react-native';
import { useBagJiggle } from '@/hooks/use-bag-jiggle';

// jest-expo's preset does not auto-mock react-native-reanimated. Provide a
// minimal mock so the hook's animation primitives resolve to plain values in
// the test env: withSpring returns its target, withSequence returns the first
// step's target (matching how Reanimated would imperatively start the
// sequence — value transitions through dx -> 0 over time, so observing
// non-zero immediately after triggerJiggle is what we assert).
jest.mock('react-native-reanimated', () => ({
  useSharedValue: <T,>(initial: T) => ({ value: initial }),
  withSpring: (toValue: number) => toValue,
  withSequence: (...steps: number[]) => steps[0],
}));

describe('useBagJiggle', () => {
  it('returns offset SharedValues at zero by default', () => {
    const { result } = renderHook(() => useBagJiggle());
    expect(result.current.offsetX.value).toBe(0);
    expect(result.current.offsetY.value).toBe(0);
  });

  it('triggerJiggle sets non-zero offsets', () => {
    const { result } = renderHook(() => useBagJiggle());
    act(() => {
      result.current.triggerJiggle(5);
    });
    // Offsets become non-zero immediately (bouncing back to 0 over ~200ms via spring)
    expect(Math.abs(result.current.offsetX.value)).toBeGreaterThan(0);
  });
});
