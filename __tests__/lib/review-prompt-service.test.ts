import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowReviewPrompt,
  hasReviewPromptBeenShown,
  checkImportDoneReviewPrompt,
  markReviewPromptShown,
  acceptReviewPrompt,
  declineReviewPrompt,
} from '@/lib/review-prompt-service';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const trackMock = analytics.track as jest.Mock;
const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

beforeEach(() => {
  jest.clearAllMocks();
  setItemMock.mockResolvedValue(undefined);
  openURLSpy.mockResolvedValue(true);
  Platform.OS = 'ios';
});

describe('shouldShowReviewPrompt — pure state machine', () => {
  it('>0 items + never shown -> show', () => {
    expect(shouldShowReviewPrompt(5, false)).toBe(true);
  });

  it('>0 items + already shown -> do not show', () => {
    expect(shouldShowReviewPrompt(5, true)).toBe(false);
  });

  it('0 items -> never show, regardless of shown-state', () => {
    expect(shouldShowReviewPrompt(0, false)).toBe(false);
    expect(shouldShowReviewPrompt(0, true)).toBe(false);
  });
});

describe('hasReviewPromptBeenShown', () => {
  it('returns false when no flag persisted', async () => {
    getItemMock.mockResolvedValue(null);
    expect(await hasReviewPromptBeenShown()).toBe(false);
  });

  it('returns true when the flag was persisted', async () => {
    getItemMock.mockResolvedValue('true');
    expect(await hasReviewPromptBeenShown()).toBe(true);
  });

  it('fails closed (treats as already shown) when AsyncStorage throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await hasReviewPromptBeenShown()).toBe(true);
  });
});

describe('checkImportDoneReviewPrompt — read-only, no side effects', () => {
  it('resolves show:true when >0 items and never shown, without persisting or tracking', async () => {
    getItemMock.mockResolvedValue(null);

    const result = await checkImportDoneReviewPrompt(12);

    expect(result).toEqual({ show: true });
    expect(setItemMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not show when already shown, even with items imported', async () => {
    getItemMock.mockResolvedValue('true');

    const result = await checkImportDoneReviewPrompt(12);

    expect(result).toEqual({ show: false });
  });

  it('does not show when the import returned 0 items', async () => {
    getItemMock.mockResolvedValue(null);

    const result = await checkImportDoneReviewPrompt(0);

    expect(result).toEqual({ show: false });
  });

  it('does not show on web, even with items and never shown', async () => {
    Platform.OS = 'web';
    getItemMock.mockResolvedValue(null);

    const result = await checkImportDoneReviewPrompt(12);

    expect(result).toEqual({ show: false });
    expect(getItemMock).not.toHaveBeenCalled();
  });
});

describe('markReviewPromptShown', () => {
  it('persists the shown-flag and fires review_prompt_requested', async () => {
    await markReviewPromptShown();

    expect(setItemMock).toHaveBeenCalledWith('review_prompt.shown', 'true');
    expect(trackMock).toHaveBeenCalledWith('review_prompt_requested', {
      source: 'tvtime_import_done',
    });
  });

  it('still fires the event even if AsyncStorage.setItem throws (best-effort persistence)', async () => {
    setItemMock.mockRejectedValue(new Error('storage unavailable'));

    await markReviewPromptShown();

    expect(trackMock).toHaveBeenCalledWith('review_prompt_requested', {
      source: 'tvtime_import_done',
    });
  });
});

describe('acceptReviewPrompt', () => {
  it('fires review_prompt_accepted and opens the App Store on iOS', () => {
    Platform.OS = 'ios';
    acceptReviewPrompt();
    expect(trackMock).toHaveBeenCalledWith('review_prompt_accepted', {
      source: 'tvtime_import_done',
    });
    expect(openURLSpy).toHaveBeenCalledWith('https://apps.apple.com/app/id6760832346');
  });

  it('opens Google Play on android', () => {
    Platform.OS = 'android';
    acceptReviewPrompt();
    expect(openURLSpy).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.pocketstubs.app'
    );
  });
});

describe('declineReviewPrompt', () => {
  it('fires review_prompt_declined and does not open a store link', () => {
    declineReviewPrompt();
    expect(trackMock).toHaveBeenCalledWith('review_prompt_declined', {
      source: 'tvtime_import_done',
    });
    expect(openURLSpy).not.toHaveBeenCalled();
  });
});
