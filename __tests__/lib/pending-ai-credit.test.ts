import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setPendingAiCredit,
  getPendingAiCredit,
  clearPendingAiCredit,
} from '@/lib/pending-ai-credit';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));

const mockAS = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const KEY = '@cinetrak/pending_ai_credit';

describe('pending-ai-credit (issue #592)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists an earned credit as JSON under the namespaced key', async () => {
    await setPendingAiCredit({ journeyId: 'j1', earnedAt: 1000 });
    expect(mockAS.setItem).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ journeyId: 'j1', earnedAt: 1000 })
    );
  });

  it('reads back a well-formed pending credit', async () => {
    mockAS.getItem.mockResolvedValue(JSON.stringify({ journeyId: 'j2', earnedAt: 42 }));
    await expect(getPendingAiCredit()).resolves.toEqual({ journeyId: 'j2', earnedAt: 42 });
  });

  it('returns null when there is no pending credit', async () => {
    mockAS.getItem.mockResolvedValue(null);
    await expect(getPendingAiCredit()).resolves.toBeNull();
  });

  it('clears a malformed value so it cannot wedge the resume loop', async () => {
    mockAS.getItem.mockResolvedValue('{"journeyId": 123}'); // wrong type
    await expect(getPendingAiCredit()).resolves.toBeNull();
    expect(mockAS.removeItem).toHaveBeenCalledWith(KEY);
  });

  it('clears only via clearPendingAiCredit', async () => {
    await clearPendingAiCredit();
    expect(mockAS.removeItem).toHaveBeenCalledWith(KEY);
  });

  it('never throws on storage failure (get returns null, set swallows)', async () => {
    mockAS.getItem.mockRejectedValue(new Error('disk full'));
    mockAS.setItem.mockRejectedValue(new Error('disk full'));
    await expect(getPendingAiCredit()).resolves.toBeNull();
    await expect(setPendingAiCredit({ journeyId: 'j', earnedAt: 1 })).resolves.toBeUndefined();
  });
});
