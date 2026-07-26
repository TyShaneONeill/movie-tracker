import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowPostImportUpsell,
  hasPostImportUpsellBeenShown,
  checkPostImportUpsell,
  markPostImportUpsellShown,
} from '@/lib/post-import-upsell-service';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const trackMock = analytics.track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setItemMock.mockResolvedValue(undefined);
});

describe('shouldShowPostImportUpsell — pure state machine', () => {
  it('non-premium + items imported + never shown -> show', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 42, alreadyShown: false })
    ).toBe(true);
  });

  it('premium user -> never show, regardless of items/shown-state', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: true, itemCount: 42, alreadyShown: false })
    ).toBe(false);
  });

  it('already shown -> do not show (one-shot; a re-import never re-triggers)', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 42, alreadyShown: true })
    ).toBe(false);
  });

  it('0 items imported -> never show', () => {
    expect(
      shouldShowPostImportUpsell({ isPremium: false, itemCount: 0, alreadyShown: false })
    ).toBe(false);
  });
});

describe('hasPostImportUpsellBeenShown', () => {
  it('returns false when no flag persisted', async () => {
    getItemMock.mockResolvedValue(null);
    expect(await hasPostImportUpsellBeenShown()).toBe(false);
  });

  it('returns true when the flag was persisted', async () => {
    getItemMock.mockResolvedValue('true');
    expect(await hasPostImportUpsellBeenShown()).toBe(true);
  });

  it('fails closed (treats as already shown) when AsyncStorage throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await hasPostImportUpsellBeenShown()).toBe(true);
  });
});

describe('checkPostImportUpsell — read-only, no side effects', () => {
  it('resolves show:true for a non-premium user who imported and never saw it', async () => {
    getItemMock.mockResolvedValue(null);

    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 12 });

    expect(result).toEqual({ show: true });
    expect(setItemMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not show for a premium user (and never touches storage)', async () => {
    const result = await checkPostImportUpsell({ isPremium: true, itemCount: 12 });

    expect(result).toEqual({ show: false });
    expect(getItemMock).not.toHaveBeenCalled();
  });

  it('does not show a second time once the flag is persisted', async () => {
    getItemMock.mockResolvedValue('true');

    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 12 });

    expect(result).toEqual({ show: false });
  });

  it('does not show when the import printed 0 stubs (and never touches storage)', async () => {
    const result = await checkPostImportUpsell({ isPremium: false, itemCount: 0 });

    expect(result).toEqual({ show: false });
    expect(getItemMock).not.toHaveBeenCalled();
  });
});

describe('markPostImportUpsellShown', () => {
  it('persists the shown-flag and fires premium:post_import_prompt_shown with counts', async () => {
    await markPostImportUpsellShown({ showCount: 30, movieCount: 120 });

    expect(setItemMock).toHaveBeenCalledWith('post_import_upsell.shown', 'true');
    expect(trackMock).toHaveBeenCalledWith('premium:post_import_prompt_shown', {
      showCount: 30,
      movieCount: 120,
    });
  });

  it('still fires the event even if AsyncStorage.setItem throws (best-effort persistence)', async () => {
    setItemMock.mockRejectedValue(new Error('storage unavailable'));

    await markPostImportUpsellShown({ showCount: 5, movieCount: 9 });

    expect(trackMock).toHaveBeenCalledWith('premium:post_import_prompt_shown', {
      showCount: 5,
      movieCount: 9,
    });
  });
});
