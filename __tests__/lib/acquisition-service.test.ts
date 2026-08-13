jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
    setPersonProperties: jest.fn(),
  },
}));

jest.mock('@/lib/sentry', () => ({
  captureException: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  shouldShowAcquisitionPrompt,
  evaluateAcquisitionPrompt,
  hasAcquisitionPromptBeenShown,
  markAcquisitionPromptShown,
  submitAcquisitionSource,
  dismissAcquisitionPrompt,
  ATTRIBUTION_CUTOFF_ISO,
  type AcquisitionGateInput,
} from '@/lib/acquisition-service';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const fromMock = supabase.from as jest.Mock;
const trackMock = analytics.track as jest.Mock;
const setPersonPropertiesMock = analytics.setPersonProperties as jest.Mock;

const eqMock = jest.fn();
const updateMock = jest.fn(() => ({ eq: eqMock }));

// A profile created after the OTA cutoff — the canonical eligible new user.
const NEW_USER: AcquisitionGateInput = {
  onboardingCompleted: true,
  profileCreatedAt: '2026-08-08T12:00:00Z',
  acquisitionSource: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  setItemMock.mockResolvedValue(undefined);
  eqMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ update: updateMock });
});

describe('shouldShowAcquisitionPrompt — pure gate', () => {
  it('shows for a post-cutoff user who finished onboarding and never answered', () => {
    expect(shouldShowAcquisitionPrompt(NEW_USER)).toBe(true);
  });

  it('never shows twice: any persisted answer wins, including skipped (reinstall guard)', () => {
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, acquisitionSource: 'producthunt' })
    ).toBe(false);
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, acquisitionSource: 'skipped' })
    ).toBe(false);
  });

  it('excludes existing users: profile created before the cutoff', () => {
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: '2026-07-15T00:00:00Z' })
    ).toBe(false);
  });

  it('treats the exact cutoff instant as eligible', () => {
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: ATTRIBUTION_CUTOFF_ISO })
    ).toBe(true);
  });

  it('fails closed on missing or unparseable created_at', () => {
    expect(shouldShowAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: null })).toBe(false);
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: 'not-a-date' })
    ).toBe(false);
  });

  it('waits for onboarding to complete', () => {
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, onboardingCompleted: false })
    ).toBe(false);
  });

  describe('reasons', () => {
    it('an eligible user has no reason', () => {
      expect(evaluateAcquisitionPrompt(NEW_USER)).toEqual({ eligible: true, reason: null });
    });

    it('a persisted answer reports already_answered, NOT already_shown', () => {
      // already_shown is the local-latch reason and belongs to the caller. A
      // profile that carries a source is the healthy terminal state; conflating
      // the two hides the case where the latch is set but the answer was lost.
      expect(evaluateAcquisitionPrompt({ ...NEW_USER, acquisitionSource: 'x' })).toEqual({
        eligible: false,
        reason: 'already_answered',
      });
      expect(
        evaluateAcquisitionPrompt({ ...NEW_USER, acquisitionSource: 'skipped' })
      ).toEqual({ eligible: false, reason: 'already_answered' });
    });

    it('an unfinished onboarding reports not_onboarded', () => {
      expect(
        evaluateAcquisitionPrompt({ ...NEW_USER, onboardingCompleted: false })
      ).toEqual({ eligible: false, reason: 'not_onboarded' });
    });

    it('an existing user reports pre_cutoff, missing dates included', () => {
      expect(
        evaluateAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: '2026-07-15T00:00:00Z' })
      ).toEqual({ eligible: false, reason: 'pre_cutoff' });
      expect(
        evaluateAcquisitionPrompt({ ...NEW_USER, profileCreatedAt: null })
      ).toEqual({ eligible: false, reason: 'pre_cutoff' });
    });
  });

  describe('dev-tier founder bypass', () => {
    const PRE_CUTOFF_DEV: AcquisitionGateInput = {
      ...NEW_USER,
      profileCreatedAt: '2026-01-15T00:00:00Z', // long before the cutoff
      accountTier: 'dev',
    };

    it('dev tier bypasses the created_at cutoff (pre-cutoff founder is eligible)', () => {
      expect(shouldShowAcquisitionPrompt(PRE_CUTOFF_DEV)).toBe(true);
    });

    it('dev tier bypasses ONLY the cutoff — every other gate still applies', () => {
      expect(
        shouldShowAcquisitionPrompt({ ...PRE_CUTOFF_DEV, acquisitionSource: 'skipped' })
      ).toBe(false);
      expect(
        shouldShowAcquisitionPrompt({ ...PRE_CUTOFF_DEV, onboardingCompleted: false })
      ).toBe(false);
    });

    it('non-dev tiers get no bypass: pre-cutoff premium/free users stay excluded', () => {
      expect(
        shouldShowAcquisitionPrompt({ ...PRE_CUTOFF_DEV, accountTier: 'free' })
      ).toBe(false);
      expect(
        shouldShowAcquisitionPrompt({ ...PRE_CUTOFF_DEV, accountTier: 'premium' })
      ).toBe(false);
    });
  });
});

describe('local shown-flag persistence', () => {
  it('reports not shown when no flag persisted', async () => {
    getItemMock.mockResolvedValue(null);
    expect(await hasAcquisitionPromptBeenShown()).toBe(false);
  });

  it('reports shown when the flag was persisted', async () => {
    getItemMock.mockResolvedValue('true');
    expect(await hasAcquisitionPromptBeenShown()).toBe(true);
  });

  it('fails closed (treats as shown) when AsyncStorage throws', async () => {
    getItemMock.mockRejectedValue(new Error('storage unavailable'));
    expect(await hasAcquisitionPromptBeenShown()).toBe(true);
  });

  it('persists the flag under the acquisition key', async () => {
    await markAcquisitionPromptShown();
    expect(setItemMock).toHaveBeenCalledWith('acquisition.prompt_shown', 'true');
  });
});

describe('submitAcquisitionSource', () => {
  it('fires acquisition:source_selected with the source payload', async () => {
    await submitAcquisitionSource('user-1', 'producthunt');

    expect(trackMock).toHaveBeenCalledWith('acquisition:source_selected', {
      source: 'producthunt',
    });
    expect(setPersonPropertiesMock).toHaveBeenCalledWith({
      acquisition_source: 'producthunt',
    });
  });

  it('persists the source to the profile row', async () => {
    await submitAcquisitionSource('user-1', 'friend');

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({ acquisition_source: 'friend' });
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
  });

  it('still tracks the event when the profile write fails', async () => {
    eqMock.mockResolvedValue({ error: { message: 'rls denied' } });

    await submitAcquisitionSource('user-1', 'x');

    expect(trackMock).toHaveBeenCalledWith('acquisition:source_selected', { source: 'x' });
  });
});

describe('dismissAcquisitionPrompt', () => {
  it('fires acquisition:prompt_dismissed and persists the skipped sentinel', async () => {
    await dismissAcquisitionPrompt('user-2');

    expect(trackMock).toHaveBeenCalledWith('acquisition:prompt_dismissed');
    expect(updateMock).toHaveBeenCalledWith({ acquisition_source: 'skipped' });
    expect(eqMock).toHaveBeenCalledWith('id', 'user-2');
    expect(setPersonPropertiesMock).not.toHaveBeenCalled();
  });
});
