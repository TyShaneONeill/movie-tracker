import { performGuardedNavigation } from '@/lib/guarded-navigation';

// requestFrame is captured synchronously so tests can fire the "next frame"
// on demand, simulating however late the real RAF actually lands.
function createSyncFrameQueue() {
  const callbacks: Array<() => void> = [];
  const requestFrame = (cb: () => void) => {
    callbacks.push(cb);
  };
  const flushOne = () => {
    const cb = callbacks.shift();
    cb?.();
  };
  return { requestFrame, flushOne, pending: () => callbacks.length };
}

describe('performGuardedNavigation', () => {
  it('abandons the redirect when the route group changed before the RAF fires', () => {
    const { requestFrame, flushOne } = createSyncFrameQueue();
    const navigate = jest.fn();
    const onAbandon = jest.fn();
    const onExhausted = jest.fn();

    // Scheduled while segments[0] was "(onboarding)" — mirrors the device log:
    // guard effect schedules the redirect, then the user reaches
    // /settings/tvtime-import (segments[0] === "settings") before the RAF fires.
    let currentGroup = 'settings';
    performGuardedNavigation('/(tabs)', '(onboarding)', {
      getCurrentGroup: () => currentGroup,
      navigate,
      requestFrame,
      onAbandon,
      onExhausted,
    });

    flushOne();

    expect(navigate).not.toHaveBeenCalled();
    expect(onAbandon).toHaveBeenCalledWith('/(tabs)', '(onboarding)', 'settings');
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('proceeds normally when the route group has not changed by the time the RAF fires', () => {
    const { requestFrame, flushOne } = createSyncFrameQueue();
    const navigate = jest.fn();
    const onAbandon = jest.fn();
    const onExhausted = jest.fn();

    const currentGroup = '(auth)';
    performGuardedNavigation('/(tabs)', '(auth)', {
      getCurrentGroup: () => currentGroup,
      navigate,
      requestFrame,
      onAbandon,
      onExhausted,
    });

    flushOne();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/(tabs)');
    expect(onAbandon).not.toHaveBeenCalled();
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('retries when the navigator is not ready yet, and stops retrying once it succeeds', () => {
    const { requestFrame, flushOne, pending } = createSyncFrameQueue();
    const notReadyError = new Error('navigate before mounting the Root Layout');
    const navigate = jest
      .fn()
      .mockImplementationOnce(() => {
        throw notReadyError;
      })
      .mockImplementationOnce(() => {
        throw notReadyError;
      })
      .mockImplementationOnce(() => {});
    const onAbandon = jest.fn();
    const onExhausted = jest.fn();

    const currentGroup = '(auth)';
    performGuardedNavigation('/(tabs)', '(auth)', {
      getCurrentGroup: () => currentGroup,
      navigate,
      requestFrame,
      onAbandon,
      onExhausted,
    });

    // Frame 1: throws not-ready, schedules a retry.
    flushOne();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(1);

    // Frame 2: throws again, schedules another retry.
    flushOne();
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(pending()).toBe(1);

    // Frame 3: navigator ready, succeeds — no further retries scheduled.
    flushOne();
    expect(navigate).toHaveBeenCalledTimes(3);
    expect(pending()).toBe(0);
    expect(onAbandon).not.toHaveBeenCalled();
    expect(onExhausted).not.toHaveBeenCalled();
  });

  it('reports via onExhausted after maxAttempts, matching pre-fix bounded-retry behavior', () => {
    const { requestFrame, flushOne, pending } = createSyncFrameQueue();
    const notReadyError = new Error('navigate before mounting the Root Layout');
    const navigate = jest.fn().mockImplementation(() => {
      throw notReadyError;
    });
    const onAbandon = jest.fn();
    const onExhausted = jest.fn();

    performGuardedNavigation('/(tabs)', '(auth)', {
      getCurrentGroup: () => '(auth)',
      navigate,
      requestFrame,
      onAbandon,
      onExhausted,
      maxAttempts: 2,
    });

    // attempt 0 fires, fails, schedules attempt 1
    flushOne();
    // attempt 1 fires, fails, schedules attempt 2
    flushOne();
    // attempt 2 fires, fails — attempt (2) is not < maxAttempts (2), so exhausted
    flushOne();

    expect(navigate).toHaveBeenCalledTimes(3);
    expect(pending()).toBe(0);
    expect(onAbandon).not.toHaveBeenCalled();
    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(notReadyError, '/(tabs)', 3);
  });

  it('re-checks the route group on each retry, abandoning mid-retry if the user has since navigated away', () => {
    const { requestFrame, flushOne, pending } = createSyncFrameQueue();
    const notReadyError = new Error('navigate before mounting the Root Layout');
    const navigate = jest.fn().mockImplementation(() => {
      throw notReadyError;
    });
    const onAbandon = jest.fn();
    const onExhausted = jest.fn();

    let currentGroup = '(onboarding)';
    performGuardedNavigation('/(tabs)', '(onboarding)', {
      getCurrentGroup: () => currentGroup,
      navigate,
      requestFrame,
      onAbandon,
      onExhausted,
    });

    // First frame: still not-ready, group unchanged — retries.
    flushOne();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(1);

    // Before the retry fires, the user reaches a different group.
    currentGroup = 'settings';

    // Retry frame: group has changed — abandon, no further navigate() call.
    flushOne();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);
    expect(onAbandon).toHaveBeenCalledWith('/(tabs)', '(onboarding)', 'settings');
    expect(onExhausted).not.toHaveBeenCalled();
  });

  // Regression for Sentry PS-48/PS-49 (web-only crash): guarded-navigation
  // calls `deps.requestFrame(cb)` as a METHOD on the deps object, so `this`
  // inside requestFrame is the deps object, not the caller's original
  // receiver. On web, app/_layout.tsx used to pass a bare reference to native
  // requestAnimationFrame (`requestFrame: requestAnimationFrame`) — a
  // spec-branded function that requires `this === window` and throws
  // "Illegal invocation" when method-called on a plain object. This pins the
  // method-call contract so a future regression (passing a bare `this`-
  // sensitive function again) is caught here, not on prod web.
  it('invokes requestFrame as a method call on deps (this === deps), documenting why suppliers must wrap this-sensitive natives', () => {
    const seenThisValues: unknown[] = [];
    const deps = {
      getCurrentGroup: () => '(auth)',
      navigate: jest.fn(),
      requestFrame(this: unknown, cb: () => void) {
        seenThisValues.push(this);
        cb();
      },
      onAbandon: jest.fn(),
      onExhausted: jest.fn(),
    };

    performGuardedNavigation('/(tabs)', '(auth)', deps);

    expect(seenThisValues).toEqual([deps]);
  });
});
