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
  alreadyShownLocally: false,
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

  it('never shows twice: local shown-flag wins', () => {
    expect(
      shouldShowAcquisitionPrompt({ ...NEW_USER, alreadyShownLocally: true })
    ).toBe(false);
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
