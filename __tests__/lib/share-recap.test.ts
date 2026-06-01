const mockCapture = jest.fn().mockResolvedValue('file:///tmp/recap.png');
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('react-native-view-shot', () => ({}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: '/tmp/', writeAsStringAsync: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

import { shareRecap } from '@/lib/share-service';

describe('shareRecap (web)', () => {
  const originalNav = (global as any).navigator;
  afterEach(() => { (global as any).navigator = originalNav; });

  it('uses navigator.share on web when available', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    (global as any).navigator = { share };
    const ref = { current: { capture: jest.fn() } } as any;
    await shareRecap(ref, 2025);
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('2025'), url: expect.stringContaining('pocketstubs.com') })
    );
  });
});
