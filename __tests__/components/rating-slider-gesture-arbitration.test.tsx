/**
 * `RatingSlider` (scan-v2) gesture-arbitration contract.
 *
 * The slider lives inside the first-take sheet's plain `ScrollView`
 * (components/scan-v2/first-take-sheet.tsx). `PanResponder` defaults
 * `onPanResponderTerminationRequest` to `true`, which means an enclosing
 * ScrollView can yank the responder away mid-drag the moment a horizontal
 * drag picks up any vertical wobble — the slider then stops tracking the
 * finger. This pins the fix: the track's `panHandlers` must refuse
 * termination requests and block the native responder (Android), so the
 * gesture stays with the slider for the whole drag.
 */
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, Circle: View, Rect: View };
});

jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
  useEffectiveColorScheme: () => 'dark',
}));

jest.mock('@/lib/haptics', () => ({
  hapticSelection: jest.fn(),
}));

import React from 'react';
import { PanResponder } from 'react-native';
import { render } from '@testing-library/react-native';

import { RatingSlider } from '@/components/scan-v2/rating-slider';

describe('RatingSlider gesture arbitration', () => {
  it('refuses to hand the responder to an enclosing ScrollView mid-drag', () => {
    const createSpy = jest.spyOn(PanResponder, 'create');

    render(<RatingSlider value={null} onChange={jest.fn()} />);

    expect(createSpy).toHaveBeenCalledTimes(1);
    const config = createSpy.mock.calls[0][0];

    // Default PanResponder behavior returns true here, which is exactly what
    // let the ScrollView steal the gesture — the fix must override both.
    expect(config.onPanResponderTerminationRequest?.({} as any, {} as any)).toBe(false);
    expect(config.onShouldBlockNativeResponder?.({} as any, {} as any)).toBe(true);

    createSpy.mockRestore();
  });
});
