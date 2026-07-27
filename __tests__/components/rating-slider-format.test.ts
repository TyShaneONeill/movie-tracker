// Isolate the pure formatRating export from rating-slider.tsx's RN import
// chain (Slider native module, theme-context -> auth-context ->
// expo-apple-authentication, which jest can't transform) — same pattern as
// __tests__/components/first-take-modal-rating.test.tsx.
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'light' }),
}));

import { formatRating } from '@/components/ui/rating-slider';

// reviews.rating became numeric(3,1) in 20260726150000 — existing whole
// ratings now round-trip as e.g. 8.0. Every raw review.rating render site
// must route through this formatter so the UI still shows "8", not "8.0".
describe('formatRating', () => {
  it('drops a trailing .0 on whole numbers', () => {
    expect(formatRating(8)).toBe('8');
    expect(formatRating(8.0)).toBe('8');
    expect(formatRating(10)).toBe('10');
    expect(formatRating(1)).toBe('1');
  });

  it('keeps one decimal place for fractional ratings', () => {
    expect(formatRating(7.5)).toBe('7.5');
    expect(formatRating(6.7)).toBe('6.7');
    expect(formatRating(9.1)).toBe('9.1');
  });
});
