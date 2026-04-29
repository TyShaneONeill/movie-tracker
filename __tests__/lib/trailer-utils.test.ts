jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
}));

import { Linking } from 'react-native';
import { openTrailer } from '@/lib/trailer-utils';

const mockOpenURL = Linking.openURL as jest.Mock;

describe('openTrailer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens YouTube with the watch URL for the given key', async () => {
    await openTrailer('dQw4w9WgXcQ');
    expect(mockOpenURL).toHaveBeenCalledWith('https://youtube.com/watch?v=dQw4w9WgXcQ');
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
  });

  it('returns the promise from Linking.openURL', async () => {
    const result = openTrailer('TESTKEY');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});
