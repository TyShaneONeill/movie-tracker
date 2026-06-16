import { useEffect, useState } from 'react';
import { getFirstLaunch } from '@/lib/first-launch';

export interface UseFirstLaunchState {
  /**
   * True only on the first launch of a fresh install on this device; `null`
   * until the flag has been read from storage. Pair with `isLoading` to gate
   * navigation so the entry screen does not flicker before the value resolves.
   */
  isFirstLaunch: boolean | null;
  /** True while the first-launch flag is being read from storage. */
  isLoading: boolean;
}

/**
 * Detects whether this is the first launch of a fresh install so the unauthed
 * entry screen can default brand-new users to sign-up and returning users to
 * sign-in (today everyone lands on "Welcome Back" — see
 * `Projects/PocketStubs/Bugs & Fixes/2026-06-16 First-launch routes to Sign In ...`).
 *
 * Mirrors the `{ value, isLoading }` ergonomics of `useGuest()` so it slots into
 * the same loading-gate pattern in the root layout. Storage is read once per app
 * process regardless of how many components call this.
 */
export function useFirstLaunch(): UseFirstLaunchState {
  const [state, setState] = useState<UseFirstLaunchState>({
    isFirstLaunch: null,
    isLoading: true,
  });

  useEffect(() => {
    let active = true;

    getFirstLaunch().then(({ isFirstLaunch }) => {
      if (active) {
        setState({ isFirstLaunch, isLoading: false });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
