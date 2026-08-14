import { useEffect, useRef, useState } from 'react';
import type { ImportProgress } from './import-client';

// Client-side smoothing for the progress bar/pill (PR-CD part 2, follows the
// chunk-count floor in import-client.ts). Real progress only ever advances at
// chunk boundaries, so even with several real data points per import the bar
// still visibly STEPS between them. This eases the DISPLAYED value toward the
// latest real value between updates so it reads as continuous motion.
//
// Honesty constraint: the eased value must never exceed the latest CONFIRMED
// `processed` count — it never claims progress the server hasn't returned,
// and therefore can never reach 100% before the import actually completes. If
// a chunk stalls, the eased value converges toward — and holds at — the last
// known point instead of extrapolating past it.

/** Fraction of the remaining gap to the target closed per tick. Small enough
 *  that a stalled chunk doesn't visibly "arrive" before the real data does. */
const EASE_FACTOR = 0.18;
/** Tick cadence for the easing loop, in ms. */
const TICK_MS = 50;
/** Remaining distance below which we snap straight to the target rather than
 *  crawling toward it asymptotically forever. */
const SNAP_EPSILON = 0.5;

/**
 * Advance `displayed` one tick toward `target`, closing a fixed fraction of
 * the remaining gap. Pure + deterministic (no timers) so it's unit-testable
 * directly. Never returns a value past `target` — a stalled or backward-moving
 * target (e.g. a fresh run resetting progress to 0) snaps immediately rather
 * than animating in the wrong direction or overshooting.
 */
export function easeProgressStep(displayed: number, target: number): number {
  if (target <= displayed) return target;
  const next = displayed + (target - displayed) * EASE_FACTOR;
  return target - next < SNAP_EPSILON ? target : next;
}

/**
 * Eases `progress.processed` toward each new real value reported by
 * {@link useImportRun} between chunk boundaries, so the bar/pill move
 * continuously instead of stepping. `total` passes through unchanged — only
 * the numerator is smoothed. See file header for the honesty constraint.
 */
export function useEasedProgress(progress: ImportProgress): ImportProgress {
  const [displayed, setDisplayed] = useState(progress.processed);
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;

  useEffect(() => {
    if (progress.processed <= displayedRef.current) {
      // Snap immediately (no need to wait for a tick) — a stalled/backward
      // target (e.g. a fresh run resetting progress to 0) must never animate
      // in the wrong direction.
      if (progress.processed !== displayedRef.current) setDisplayed(progress.processed);
      return;
    }
    const id = setInterval(() => {
      setDisplayed((prev) => {
        const next = easeProgressStep(prev, progress.processed);
        if (next === prev) clearInterval(id);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [progress.processed]);

  return { processed: displayed, total: progress.total };
}
