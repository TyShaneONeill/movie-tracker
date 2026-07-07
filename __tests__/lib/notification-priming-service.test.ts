import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowPriming,
  hasPrimingBeenShown,
  checkFirstWinPriming,
  acceptPriming,
  declinePriming,
} from '@/lib/notification-priming-service';
import * as pushService from '@/lib/push-notification-service';
import { analytics } from '@/lib/analytics';

jest.mock('@/lib/push-notification-service', () => ({
  getPermissionStatus: jest.fn(),
  registerForPushNotifications: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const getPermissionStatusMock = pushService.getPermissionStatus as jest.Mock;
const registerMock = pushService.registerForPushNotifications as jest.Mock;
const trackMock = analytics.track as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setItemMock.mockResolvedValue(undefined);
});

describe('shouldShowPriming — pure state machine', () => {
  it('undetermined + never shown -> show', () => {
    expect(shouldShowPriming('undetermined', false)).toBe(true);
  });

  it('undetermined + already shown -> do not show', () => {
    expect(shouldShowPriming('undetermined', true)).toBe(false);
  });

  it('denied -> never show, regardless of shown-state', () => {
    expect(shouldShowPriming('denied', false)).toBe(false);
    expect(shouldShowPriming('denied', true)).toBe(false);
  });

  it('granted -> never show, regardless of shown-state', () => {
    expect(shouldShowPriming('granted', false)).toBe(false);
    expect(shouldShowPriming('granted', true)).toBe(false);
  });
});

describe('hasPrimingBeenShown', () => {
  it('returns false when no flag persisted', async () => {
    getItemMock.mockResolvedValue(null);
    expect(await hasPrimingBeenShown()).toBe(false);
  });

  it('returns true when the flag was persisted', async () => {
    getItemMock.mockResolvedValue('true');
    expect(await hasPrimingBeenShown()).toBe(true);
  });

  it('fails closed (treats as already shown) when AsyncStorage throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await hasPrimingBeenShown()).toBe(true);
  });
});

describe('checkFirstWinPriming', () => {
  it('shows and persists the shown-flag when undetermined and never shown', async () => {
    getItemMock.mockResolvedValue(null);
    getPermissionStatusMock.mockResolvedValue('undetermined');

    const result = await checkFirstWinPriming();

    expect(result).toEqual({ show: true });
    expect(setItemMock).toHaveBeenCalledWith('push.priming_shown', 'true');
    expect(trackMock).toHaveBeenCalledWith('push:priming_shown');
  });

  it('does not show when already shown, even if still undetermined', async () => {
    getItemMock.mockResolvedValue('true');
    getPermissionStatusMock.mockResolvedValue('undetermined');

    const result = await checkFirstWinPriming();

    expect(result).toEqual({ show: false });
    expect(setItemMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not show when permission is already denied', async () => {
    getItemMock.mockResolvedValue(null);
    getPermissionStatusMock.mockResolvedValue('denied');

    const result = await checkFirstWinPriming();

    expect(result).toEqual({ show: false });
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('does not show when permission is already granted', async () => {
    getItemMock.mockResolvedValue(null);
    getPermissionStatusMock.mockResolvedValue('granted');

    const result = await checkFirstWinPriming();

    expect(result).toEqual({ show: false });
    expect(setItemMock).not.toHaveBeenCalled();
  });
});

describe('acceptPriming', () => {
  it('fires push:priming_accepted and registers for push', async () => {
    registerMock.mockResolvedValue({ success: true });
    await acceptPriming();
    expect(trackMock).toHaveBeenCalledWith('push:priming_accepted');
    expect(registerMock).toHaveBeenCalledTimes(1);
  });
});

describe('declinePriming', () => {
  it('fires push:priming_declined and does not touch permission APIs', () => {
    declinePriming();
    expect(trackMock).toHaveBeenCalledWith('push:priming_declined');
    expect(registerMock).not.toHaveBeenCalled();
  });
});
