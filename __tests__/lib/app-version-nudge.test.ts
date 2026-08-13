import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureMessage } from '@/lib/sentry';
import {
  compareVersions,
  parseNudgeConfig,
  resolveNudgeTier,
  isNudgeSnoozed,
  getNudgeSnooze,
  recordNudgeSnooze,
  resetMalformedPayloadReport,
  storeUrl,
  DEFAULT_SNOOZE_DAYS,
  type NudgeConfig,
} from '@/lib/app-version-nudge';

// AsyncStorage and @/lib/sentry are mocked globally in __tests__/setup.ts.
const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const captureMessageMock = captureMessage as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetMalformedPayloadReport();
});

describe('compareVersions', () => {
  it('orders equal versions, padding missing segments with zero', () => {
    expect(compareVersions('1.6.1', '1.6.1')).toBe(0);
    expect(compareVersions('1.6', '1.6.0')).toBe(0);
    expect(compareVersions('1.6.0.0', '1.6')).toBe(0);
    expect(compareVersions('01.06.01', '1.6.1')).toBe(0);
  });

  it('compares segments numerically, not lexicographically', () => {
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('treats a longer version with a non-zero tail as newer', () => {
    expect(compareVersions('1.6.1', '1.6.1.1')).toBe(-1);
    expect(compareVersions('1.6.1.1', '1.6.1')).toBe(1);
  });

  it('returns null for anything that is not a dotted numeric version', () => {
    expect(compareVersions('1.x.0', '1.6.0')).toBeNull();
    expect(compareVersions('', '1.6.0')).toBeNull();
    expect(compareVersions('1.6.0-beta', '1.6.0')).toBeNull();
    expect(compareVersions(null, '1.6.0')).toBeNull();
    expect(compareVersions('1.6.0', null)).toBeNull();
  });

  it('rejects a bare build number, which would make every user look outdated', () => {
    // "34" is the iOS CFBundleVersion, not a runtime version. Parsed naively it
    // beats "1.6.0" and would nudge the entire install base.
    expect(compareVersions('1.6.0', '34')).toBeNull();
    expect(compareVersions('34', '58')).toBeNull();
  });
});

describe('parseNudgeConfig', () => {
  it('reads the top-level tiers and defaults the snooze window', () => {
    expect(parseNudgeConfig({ recommended: '1.6.1' }, 'ios')).toEqual({
      recommended: '1.6.1',
      minimum: null,
      snoozeDays: DEFAULT_SNOOZE_DAYS,
    });
  });

  it('lets a per-platform block override the top level', () => {
    const payload = {
      recommended: '1.6.1',
      snoozeDays: 30,
      android: { recommended: '1.6.0' },
    };
    expect(parseNudgeConfig(payload, 'android')?.recommended).toBe('1.6.0');
    expect(parseNudgeConfig(payload, 'ios')?.recommended).toBe('1.6.1');
    // Keys the platform block omits still fall through to the top level.
    expect(parseNudgeConfig(payload, 'android')?.snoozeDays).toBe(30);
  });

  it('ignores a non-positive or non-numeric snoozeDays', () => {
    expect(parseNudgeConfig({ recommended: '1.6.1', snoozeDays: 0 }, 'ios')?.snoozeDays).toBe(
      DEFAULT_SNOOZE_DAYS
    );
    expect(parseNudgeConfig({ recommended: '1.6.1', snoozeDays: '7' }, 'ios')?.snoozeDays).toBe(
      DEFAULT_SNOOZE_DAYS
    );
  });

  it('returns null on web — there is no store listing to open', () => {
    expect(parseNudgeConfig({ recommended: '1.6.1' }, 'web')).toBeNull();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('returns null for a missing payload without reporting to Sentry', () => {
    expect(parseNudgeConfig(undefined, 'ios')).toBeNull();
    expect(parseNudgeConfig(null, 'ios')).toBeNull();
    expect(parseNudgeConfig('1.6.1', 'ios')).toBeNull();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('reports a payload with no usable version once per session', () => {
    expect(parseNudgeConfig({ recomended: '1.6.1' }, 'ios')).toBeNull();
    expect(parseNudgeConfig({ recommended: '34' }, 'ios')).toBeNull();
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe('resolveNudgeTier', () => {
  const config: NudgeConfig = { recommended: '1.6.1', minimum: '1.5.0', snoozeDays: 7 };

  it('places a binary below minimum in the minimum tier', () => {
    expect(resolveNudgeTier('1.4.1', config)).toBe('minimum');
  });

  it('places a binary between the tiers in the recommended tier', () => {
    expect(resolveNudgeTier('1.6.0', config)).toBe('recommended');
    expect(resolveNudgeTier('1.5.0', config)).toBe('recommended');
  });

  it('shows nothing at or above recommended', () => {
    expect(resolveNudgeTier('1.6.1', config)).toBe('none');
    expect(resolveNudgeTier('1.7.0', config)).toBe('none');
  });

  it('supports a recommended-only config', () => {
    const recOnly: NudgeConfig = { recommended: '1.6.1', minimum: null, snoozeDays: 7 };
    expect(resolveNudgeTier('1.0.0', recOnly)).toBe('recommended');
  });

  it('shows nothing when the running version is unknown or unparseable', () => {
    expect(resolveNudgeTier(null, config)).toBe('none');
    expect(resolveNudgeTier('exposdk:54', config)).toBe('none');
  });

  it('shows nothing without a config', () => {
    expect(resolveNudgeTier('1.0.0', null)).toBe('none');
  });
});

describe('isNudgeSnoozed', () => {
  const NOW = Date.UTC(2026, 7, 13);
  const DAY = 24 * 60 * 60 * 1000;

  it('fails closed while the stored value is still loading', () => {
    expect(isNudgeSnoozed(undefined, '1.6.1', 7, NOW)).toBe(true);
  });

  it('is not snoozed when nothing was ever dismissed', () => {
    expect(isNudgeSnoozed(null, '1.6.1', 7, NOW)).toBe(false);
  });

  it('suppresses inside the window and resurfaces after it', () => {
    const snooze = { version: '1.6.1', snoozedAt: NOW - 6 * DAY };
    expect(isNudgeSnoozed(snooze, '1.6.1', 7, NOW)).toBe(true);
    expect(isNudgeSnoozed(snooze, '1.6.1', 5, NOW)).toBe(false);
  });

  it('resurfaces immediately when a newer version is recommended', () => {
    const snooze = { version: '1.6.1', snoozedAt: NOW };
    expect(isNudgeSnoozed(snooze, '1.6.2', 7, NOW)).toBe(false);
  });

  it('never expires into a permanent dismissal — it only ever snoozes', () => {
    const ancient = { version: '1.6.1', snoozedAt: NOW - 400 * DAY };
    expect(isNudgeSnoozed(ancient, '1.6.1', 7, NOW)).toBe(false);
  });
});

describe('snooze storage', () => {
  it('reads a stored snooze', async () => {
    getItemMock.mockResolvedValue(JSON.stringify({ version: '1.6.1', snoozedAt: 42 }));
    await expect(getNudgeSnooze()).resolves.toEqual({ version: '1.6.1', snoozedAt: 42 });
  });

  it('treats missing, malformed, and unreadable storage as never dismissed', async () => {
    getItemMock.mockResolvedValue(null);
    await expect(getNudgeSnooze()).resolves.toBeNull();

    getItemMock.mockResolvedValue('{not json');
    await expect(getNudgeSnooze()).resolves.toBeNull();

    getItemMock.mockResolvedValue(JSON.stringify({ version: 7 }));
    await expect(getNudgeSnooze()).resolves.toBeNull();

    getItemMock.mockRejectedValue(new Error('storage down'));
    await expect(getNudgeSnooze()).resolves.toBeNull();
  });

  it('records a snooze and survives a write failure', async () => {
    setItemMock.mockResolvedValue(undefined);
    await expect(recordNudgeSnooze('1.6.1')).resolves.toMatchObject({ version: '1.6.1' });
    expect(setItemMock).toHaveBeenCalled();

    setItemMock.mockRejectedValue(new Error('storage down'));
    await expect(recordNudgeSnooze('1.6.1')).resolves.toMatchObject({ version: '1.6.1' });
  });
});

describe('storeUrl', () => {
  it('carries the campaign tag for each store', () => {
    expect(storeUrl('ios')).toBe('https://apps.apple.com/app/id6760832346?ct=app-update-nudge');
    expect(storeUrl('android')).toContain('referrer=utm_source%3Dapp-update-nudge');
    expect(storeUrl('web')).toBeNull();
  });
});
