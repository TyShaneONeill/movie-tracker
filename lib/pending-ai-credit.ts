/**
 * Durable "pending AI-generation credit" (issue #592).
 *
 * A rewarded ad grants an AI-generation credit via the `grant-ad-reward` edge
 * function. If that grant fires while the ad activity still owns the foreground
 * (or the app is killed between earning the reward and the grant landing), the
 * user watched an ad for nothing. We persist the earned reward the instant it
 * fires, retry the grant once the app is foregrounded, and resume any
 * unconsumed credit on the next launch — the credit is consumed ONLY after a
 * successful server grant.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';

const KEY = '@cinetrak/pending_ai_credit';

export interface PendingAiCredit {
  /** Journey the user was generating art for when they watched the ad. */
  journeyId: string;
  /** ms epoch the reward was earned — stamped by the caller (avoids Date in tests). */
  earnedAt: number;
}

/** Record an earned-but-not-yet-granted ad reward. Safe to call repeatedly. */
export async function setPendingAiCredit(credit: PendingAiCredit): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(credit));
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'pending-ai-credit-set',
    });
  }
}

/** Read a pending credit if one is awaiting a successful grant. */
export async function getPendingAiCredit(): Promise<PendingAiCredit | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAiCredit>;
    if (typeof parsed?.journeyId === 'string' && typeof parsed?.earnedAt === 'number') {
      return { journeyId: parsed.journeyId, earnedAt: parsed.earnedAt };
    }
    // Malformed — clear it so it can't wedge the resume loop.
    await AsyncStorage.removeItem(KEY);
    return null;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'pending-ai-credit-get',
    });
    return null;
  }
}

/** Clear the pending credit — call ONLY after a confirmed successful grant. */
export async function clearPendingAiCredit(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'pending-ai-credit-clear',
    });
  }
}
