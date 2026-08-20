import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { AchievementCelebration } from '@/components/achievement-celebration';
import { useAuth } from '@/hooks/use-auth';
import {
  recordUserActivity,
  streakSpineEnabledNow,
  type StreakAction,
  type StreakRpcResult,
} from './streak-service';
import { MILESTONES } from './streak-logic';
import {
  deriveCelebration,
  nextCelebrationMemory,
  readCelebrationMemory,
  writeCelebrationMemory,
} from './streak-celebration';

/**
 * Streak context (PS-15 PR 3; celebration takeover in v2). Exposes a single
 * imperative `recordActivity` that qualifying-action handlers call in their
 * mutation onSuccess (mirroring triggerFirstWinCheck in
 * notification-priming-context). `streakVersion` bumps after every recorded
 * action so the streak surfaces can refetch without a manual refresh.
 *
 * Gated on streak_spine (separate from daily_hooks — Ty-only until
 * device-validated): when off, recordActivity is a no-op and nothing is
 * written or shown.
 *
 * The gate is read at CALL TIME, not at mount. This provider mounts at the app
 * root, before PostHog's identify call delivers person-targeted flags, so any
 * hook that samples the flag while rendering the provider latches false for the
 * whole session and silently drops every qualifying action. Checking when the
 * user actually acts also covers actions in the first seconds after launch,
 * which a subscribing hook would still miss.
 *
 * CELEBRATIONS, IN ORDER. An action that extends the streak raises
 * `pendingCelebration`, which StreakCelebrationTakeover (mounted at the
 * navigator root) plays. Only when the takeover has fully cleared does a
 * milestone hand off to AchievementCelebration — the two used to be able to
 * stack, and a modal popping over a running takeover buries it. See
 * `dismissCelebration`.
 */

interface MilestoneCelebration {
  icon: string;
  name: string;
  description: string;
  level?: number;
}

/** A streak extension waiting to be played. */
export interface PendingCelebration {
  /** Distinguishes consecutive plays so the takeover remounts with fresh state. */
  id: number;
  from: number;
  to: number;
  milestone: number | null;
}

interface StreakContextValue {
  recordActivity: (action: StreakAction) => void;
  streakVersion: number;
  pendingCelebration: PendingCelebration | null;
  /** Called by the takeover at its exit settle point, not at t=0. */
  dismissCelebration: () => void;
}

const StreakContext = createContext<StreakContextValue>({
  recordActivity: () => {},
  streakVersion: 0,
  pendingCelebration: null,
  dismissCelebration: () => {},
});

export function useStreak() {
  return useContext(StreakContext);
}

/**
 * Dev-only: raise a takeover on launch without waiting for a real day boundary.
 * A genuine extension can only happen once per local day, so there is otherwise
 * no way to watch the sequence twice in an afternoon.
 *
 *   EXPO_PUBLIC_STREAK_CELEBRATION_DEMO=12:13   extension
 *   EXPO_PUBLIC_STREAK_CELEBRATION_DEMO=29:30   extension + milestone handoff
 *
 * Behind __DEV__ as well as the env var, so it cannot reach a release build even
 * if the variable leaks into one. Follows the EXPO_PUBLIC_*_OVERRIDE convention
 * used by daily_hooks, episode_rooms and the rest.
 */
function demoCelebration(): Omit<PendingCelebration, 'id'> | null {
  if (!__DEV__) return null;
  const raw = process.env.EXPO_PUBLIC_STREAK_CELEBRATION_DEMO;
  if (!raw) return null;
  const [from, to] = raw.split(':').map((n: string) => Number.parseInt(n, 10));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return { from, to, milestone: MILESTONES.includes(to) ? to : null };
}

// DRAFT copy — cinephile-dry, Content Queue review pending (PS-15 PR 3).
const MILESTONE_COPY: Record<number, { icon: string; description: string }> = {
  3: { icon: '🎟️', description: 'Three days in a row. The habit is forming.' },
  7: { icon: '🎫', description: 'A full week at the movies. Nicely done.' },
  30: { icon: '🏆', description: 'Thirty straight days. That is a season pass.' },
  100: { icon: '👑', description: 'One hundred days. You live here now.' },
};

function milestoneCelebration(milestone: number): MilestoneCelebration {
  const copy = MILESTONE_COPY[milestone] ?? {
    icon: '🔥',
    description: 'Streak milestone reached.',
  };
  return {
    icon: copy.icon,
    name: `${milestone}-Day Streak`,
    description: copy.description,
    level: 1,
  };
}

export function StreakProvider({ children }: { children: React.ReactNode }) {
  const [celebration, setCelebration] = useState<MilestoneCelebration | null>(null);
  const [streakVersion, setStreakVersion] = useState(0);
  const [pendingCelebration, setPendingCelebration] = useState<PendingCelebration | null>(
    null
  );
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Held back until the takeover clears, so the modal never lands on top of it.
  const queuedMilestone = useRef<MilestoneCelebration | null>(null);
  const celebrationId = useRef(0);
  /**
   * Two qualifying actions can land within the same tick — a rating and a log
   * from one save, say. Interleaved read-derive-write against the persisted
   * baseline would let BOTH read `lastStreak: 12`, both derive 12→13, and both
   * raise a takeover. Chaining every result through one promise makes the second
   * read the baseline the first just wrote, which resolves it to "13 is not more
   * than 13" and drops it. Matters NOW: every shipped client is on the
   * remembered-baseline path until the previous_streak migration deploys.
   */
  const resultQueue = useRef<Promise<void>>(Promise.resolve());
  /** Belt and braces against the same race: one takeover on screen at a time. */
  const celebrationInFlight = useRef(false);

  useEffect(() => {
    const demo = demoCelebration();
    if (!demo) return;
    celebrationId.current += 1;
    celebrationInFlight.current = true;
    queuedMilestone.current = demo.milestone
      ? milestoneCelebration(demo.milestone)
      : null;
    setPendingCelebration({ id: celebrationId.current, ...demo });
  }, []);

  const recordActivity = useCallback(
    (action: StreakAction) => {
      // Gate before the write — nothing is recorded while streak_spine is dark.
      // Read now, not at mount: see the call-time note in the file header.
      if (!streakSpineEnabledNow()) return;
      recordUserActivity(action)
        .then((result) => {
          if (!result) return;
          setStreakVersion((v) => v + 1);
          // Serialized: see resultQueue. Errors are swallowed per-link so one
          // bad result cannot poison the chain for every later action.
          resultQueue.current = resultQueue.current
            .then(() => handleResult(result))
            .catch(() => {});
        })
        .catch(() => {});

      async function handleResult(result: StreakRpcResult) {
        // An anonymous/guest session has no namespace to remember against, and
        // no streak either — the RPC would have thrown before reaching here.
        if (!userId) return;

        const memory = await readCelebrationMemory(userId);
        const trigger = deriveCelebration(result, memory);
        await writeCelebrationMemory(
          userId,
          nextCelebrationMemory(result, memory, trigger !== null)
        );

        if (!trigger) {
          // No takeover — but a milestone the takeover isn't going to carry
          // still deserves its modal (belt and braces: the RPC only sets
          // `milestone` on the call that advanced, so this is not expected).
          if (result.milestone) setCelebration(milestoneCelebration(result.milestone));
          return;
        }

        if (celebrationInFlight.current) return;
        celebrationInFlight.current = true;
        celebrationId.current += 1;
        queuedMilestone.current = trigger.milestone
          ? milestoneCelebration(trigger.milestone)
          : null;
        setPendingCelebration({ id: celebrationId.current, ...trigger });
      }
    },
    [userId]
  );

  /**
   * The takeover has finished clearing. Only now may a milestone modal open —
   * the handoff point is the exit's settle, not the moment the user tapped.
   */
  const dismissCelebration = useCallback(() => {
    setPendingCelebration(null);
    celebrationInFlight.current = false;
    const queued = queuedMilestone.current;
    queuedMilestone.current = null;
    if (queued) setCelebration(queued);
  }, []);

  return (
    <StreakContext.Provider
      value={{ recordActivity, streakVersion, pendingCelebration, dismissCelebration }}
    >
      {/* The takeover mounts as a sibling of the navigator rather than inside a
          Modal, so nothing hides the app beneath it from a screen reader on its
          own — TalkBack would happily read the feed through the dim. iOS gets
          that from accessibilityViewIsModal on the takeover itself; Android
          needs the siblings marked, which means marking the whole app tree
          here. Layout-neutral: a flex:1 View inside the flex parents it
          already had. */}
      <View
        style={styles.appContent}
        importantForAccessibility={
          pendingCelebration ? 'no-hide-descendants' : 'auto'
        }
      >
        {children}
      </View>
      <AchievementCelebration
        achievement={celebration}
        visible={celebration !== null}
        onDismiss={() => setCelebration(null)}
      />
    </StreakContext.Provider>
  );
}

const styles = StyleSheet.create({
  appContent: { flex: 1 },
});
