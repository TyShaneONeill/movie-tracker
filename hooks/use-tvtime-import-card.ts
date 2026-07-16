import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { useHasTvTimeImport } from '@/hooks/use-has-tvtime-import';
import {
  getImportBannerDismissal,
  recordImportBannerDismissal,
  isBannerAllowedByDismissal,
  type ImportBannerDismissal,
} from '@/lib/tvtime-import';

/**
 * Drives the dismissable "Coming from TV Time?" home banner. Visible iff the
 * flag is on AND the user has no successful import AND the dismissal policy
 * (bounded count + snooze window, see {@link isBannerAllowedByDismissal})
 * allows it. Dismissal is applied optimistically and guarded against
 * double-fire so a fast double-tap can never jump the count.
 */
export function useTvTimeImportCard(): { visible: boolean; onImport: () => void; onDismiss: () => void } {
  const gate = useTvTimeImportGate();
  const { hasImport, isLoading: hasImportLoading } = useHasTvTimeImport();
  const { user } = useAuth();
  const [dismissal, setDismissal] = useState<ImportBannerDismissal | null>(null);
  const dismissingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setDismissal({ count: 0, lastDismissedAt: null });
      return;
    }
    getImportBannerDismissal(user.id).then((d) => {
      if (!cancelled) setDismissal(d);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onImport = useCallback(() => {
    router.push('/settings/tvtime-import?from=home_card');
  }, []);

  const onDismiss = useCallback(() => {
    // Guard double-fire: a second tap before the first settles must not bump the
    // count to 2 / permanent.
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    // Optimistically hide + increment BEFORE the AsyncStorage round-trip so the
    // banner disappears instantly; persistence catches up in the background.
    setDismissal((prev) => ({ count: (prev?.count ?? 0) + 1, lastDismissedAt: Date.now() }));
    if (user) void recordImportBannerDismissal(user.id).then(setDismissal);
  }, [user]);

  const visible =
    gate.enabled &&
    !gate.resolving &&
    !hasImportLoading &&
    !hasImport &&
    isBannerAllowedByDismissal(dismissal);

  return { visible, onImport, onDismiss };
}
