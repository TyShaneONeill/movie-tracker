import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAcquisitionPrompt,
  __resetAcquisitionGateTelemetryForTests,
} from '@/hooks/use-acquisition-prompt';
import { supabase } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';

// AsyncStorage and @/lib/sentry are mocked globally in __tests__/setup.ts.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({
  analytics: { track: jest.fn(), setPersonProperties: jest.fn() },
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: jest.fn(() => true),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useAcquisitionPromptGate: jest.fn(() => ({
    enabled: true,
    resolved: true,
    resolution: 'flag',
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAcquisitionPromptGate } = require('@/hooks/use-feature-flag');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useIsFocused } = require('@react-navigation/native');
const gateMock = useAcquisitionPromptGate as jest.Mock;
const isFocusedMock = useIsFocused as jest.Mock;

const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;
const fromMock = supabase.from as jest.Mock;
const trackMock = analytics.track as jest.Mock;
const captureExceptionMock = captureException as jest.Mock;

const singleMock = jest.fn();

/** A brand-new, post-onboarding, post-cutoff profile — the eligible case. */
const ELIGIBLE_PROFILE = {
  onboarding_completed: true,
  created_at: '2026-08-10T00:00:00Z',
  acquisition_source: null,
  account_tier: 'free',
};

function gateReasons(): string[] {
  return trackMock.mock.calls
    .filter(([event]) => event === 'acquisition:gate_evaluated')
    .map(([, props]) => props.reason);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetAcquisitionGateTelemetryForTests();
  gateMock.mockReturnValue({ enabled: true, resolved: true, resolution: 'flag' });
  isFocusedMock.mockReturnValue(true);
  getItemMock.mockResolvedValue(null); // not shown locally
  setItemMock.mockResolvedValue(undefined);
  singleMock.mockResolvedValue({ data: ELIGIBLE_PROFILE, error: null });
  fromMock.mockReturnValue({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({ single: singleMock })),
    })),
  });
});

describe('useAcquisitionPrompt — resolved flag gate', () => {
  it('flag off (resolved): no prompt, NO queries at all, reason flag_off', async () => {
    gateMock.mockReturnValue({ enabled: false, resolved: true, resolution: 'flag' });

    const { result } = renderHook(() => useAcquisitionPrompt());

    // Give any (wrong) async work a beat to surface before asserting silence.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getItemMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
    expect(gateReasons()).toEqual(['flag_off']);
  });

  it('flag UNRESOLVED is not treated as off — it waits, and reports nothing', async () => {
    // The #800 latent defect: on a genuine first run PostHog has not answered
    // yet, and the old mount+1s double-sample burned the one eligibility run on
    // an undefined flag.
    gateMock.mockReturnValue({ enabled: false, resolved: false, resolution: 'pending' });

    const { result } = renderHook(() => useAcquisitionPrompt());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
    expect(gateReasons()).toEqual([]);
  });

  it('flags arriving LATE still get the prompt shown', async () => {
    gateMock.mockReturnValue({ enabled: false, resolved: false, resolution: 'pending' });

    const { result, rerender } = renderHook(() => useAcquisitionPrompt());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.visible).toBe(false);

    gateMock.mockReturnValue({ enabled: true, resolved: true, resolution: 'flag' });
    rerender({});

    await waitFor(() => expect(result.current.visible).toBe(true), { timeout: 3000 });
  });

  it('a backstop resolution reports flag_unresolved, NOT flag_off', async () => {
    // What the gate hands us when PostHog never answered (offline / init
    // failure). `enabled: false` here is UNKNOWN, and calling it flag_off would
    // lie in precisely the scenario gate_evaluated exists to diagnose.
    gateMock.mockReturnValue({ enabled: false, resolved: true, resolution: 'backstop' });

    const { result } = renderHook(() => useAcquisitionPrompt());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
    expect(gateReasons()).toEqual(['flag_unresolved']);
  });

  it('flag on: a pre-cutoff dev-tier founder account becomes eligible', async () => {
    singleMock.mockResolvedValue({
      data: {
        onboarding_completed: true,
        created_at: '2026-01-15T00:00:00Z', // predates the cutoff
        acquisition_source: null,
        account_tier: 'dev',
      },
      error: null,
    });

    const { result } = renderHook(() => useAcquisitionPrompt());

    // Visibility lands after the InteractionManager handoff + 600ms show delay.
    await waitFor(() => expect(result.current.visible).toBe(true), {
      timeout: 3000,
    });
  });

  it('flag on: a pre-cutoff normal user stays excluded', async () => {
    singleMock.mockResolvedValue({
      data: {
        onboarding_completed: true,
        created_at: '2026-01-15T00:00:00Z',
        acquisition_source: null,
        account_tier: 'free',
      },
      error: null,
    });

    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(singleMock).toHaveBeenCalled());
    // Longer than the 600ms show delay — if the gate wrongly passed, visible
    // would have flipped by now.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(result.current.visible).toBe(false);
  });
});

describe('useAcquisitionPrompt — profile read', () => {
  it('reports the SELECT error to Sentry and stays hidden (missing-migration guard)', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'column profiles.acquisition_source does not exist' },
    });

    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(captureExceptionMock).toHaveBeenCalled());
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'column profiles.acquisition_source does not exist',
      }),
      { context: 'acquisition-prompt-profile-read' }
    );
    expect(result.current.visible).toBe(false);
  });

  it('does not query the profile at all when the local shown-flag is set', async () => {
    getItemMock.mockResolvedValue('true');

    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(getItemMock).toHaveBeenCalled());
    expect(fromMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);
  });
});

describe('useAcquisitionPrompt — the once-ever latch is spent at ANSWER time', () => {
  it('showing the sheet does NOT burn the latch', async () => {
    const { result } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(result.current.visible).toBe(true), { timeout: 3000 });
    // An impression nobody answered (backgrounded, force-quit) must leave the
    // ask available for the next launch.
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('answering burns the latch and persists the source', async () => {
    const { result } = renderHook(() => useAcquisitionPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true), { timeout: 3000 });

    act(() => result.current.onSelect('producthunt'));

    await waitFor(() =>
      expect(setItemMock).toHaveBeenCalledWith('acquisition.prompt_shown', 'true')
    );
    expect(trackMock).toHaveBeenCalledWith('acquisition:source_selected', {
      source: 'producthunt',
    });
    // onSelect persists only — the sheet stays up for the thank-you beat and
    // onClose is what takes it away.
    expect(result.current.visible).toBe(true);

    act(() => result.current.onClose());
    expect(result.current.visible).toBe(false);
  });

  it('dismissing burns the latch and writes the terminal skipped state', async () => {
    const { result } = renderHook(() => useAcquisitionPrompt());
    await waitFor(() => expect(result.current.visible).toBe(true), { timeout: 3000 });

    act(() => result.current.onDismiss());

    expect(result.current.visible).toBe(false);
    await waitFor(() =>
      expect(setItemMock).toHaveBeenCalledWith('acquisition.prompt_shown', 'true')
    );
    expect(trackMock).toHaveBeenCalledWith('acquisition:prompt_dismissed');
  });
});

describe('useAcquisitionPrompt — observable gating', () => {
  it('reports already_shown when the local latch is set', async () => {
    getItemMock.mockResolvedValue('true');

    renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(gateReasons()).toEqual(['already_shown']));
  });

  it('reports already_ANSWERED when the profile already carries a source', async () => {
    // Distinct from already_shown (local latch): the pair "latch set, profile
    // empty" is a lost answer, and collapsing both into one reason would hide it.
    singleMock.mockResolvedValue({
      data: { ...ELIGIBLE_PROFILE, acquisition_source: 'skipped' },
      error: null,
    });

    renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(gateReasons()).toEqual(['already_answered']));
  });

  it('reports not_onboarded before onboarding completes', async () => {
    singleMock.mockResolvedValue({
      data: { ...ELIGIBLE_PROFILE, onboarding_completed: false },
      error: null,
    });

    renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(gateReasons()).toEqual(['not_onboarded']));
  });

  it('reports pre_cutoff for an existing user', async () => {
    singleMock.mockResolvedValue({
      data: { ...ELIGIBLE_PROFILE, created_at: '2026-01-15T00:00:00Z' },
      error: null,
    });

    renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(gateReasons()).toEqual(['pre_cutoff']));
  });

  it('reports lost_focus when Home is left before the sheet fires', async () => {
    const { result, rerender } = renderHook(() => useAcquisitionPrompt());

    await waitFor(() => expect(singleMock).toHaveBeenCalled());
    // Navigate away inside the 600ms show delay (the post-onboarding handoff).
    isFocusedMock.mockReturnValue(false);
    rerender({});

    await waitFor(() => expect(gateReasons()).toEqual(['lost_focus']), { timeout: 3000 });
    expect(result.current.visible).toBe(false);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('emits one event per reason per session, not one per render', async () => {
    gateMock.mockReturnValue({ enabled: false, resolved: true, resolution: 'flag' });

    const { rerender } = renderHook(() => useAcquisitionPrompt());
    rerender({});
    rerender({});

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateReasons()).toEqual(['flag_off']);
  });
});

describe('useAcquisitionPrompt — re-evaluates on re-focus', () => {
  it('an unanswered, lost-focus launch gets another chance when Home returns', async () => {
    isFocusedMock.mockReturnValue(false);
    const { result, rerender } = renderHook(() => useAcquisitionPrompt());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fromMock).not.toHaveBeenCalled();

    // The old code latched checkedRef on mount, so this second chance never came.
    isFocusedMock.mockReturnValue(true);
    rerender({});

    await waitFor(() => expect(result.current.visible).toBe(true), { timeout: 3000 });
  });
});
