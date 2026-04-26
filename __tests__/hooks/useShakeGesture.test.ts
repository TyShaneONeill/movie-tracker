import { renderHook } from '@testing-library/react-native';

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { useShakeGesture } from '../../hooks/useShakeGesture';

describe('useShakeGesture', () => {
  it('does not call onShake without accelerometer events', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeGesture({ onShake, enabled: true }));
    expect(onShake).not.toHaveBeenCalled();
  });

  it('does not call onShake when disabled', () => {
    const onShake = jest.fn();
    renderHook(() => useShakeGesture({ onShake, enabled: false }));
    expect(onShake).not.toHaveBeenCalled();
  });
});
