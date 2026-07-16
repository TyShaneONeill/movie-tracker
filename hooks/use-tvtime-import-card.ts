import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { useHasTvTimeImport } from '@/hooks/use-has-tvtime-import';
import {
  getImportBannerDismissal,
  recordImportBannerDismissal,
  type ImportBannerDismissal,
} from '@/lib/tvtime-import';

// Home banner return policy (founder-settled):
//   visible  iff  flag on
//            AND  the user has NO successful import (ever)
//            AND  dismissed fewer than MAX_DISMISSALS times
//            AND  (never dismissed OR last dismissal was > SNOOZE_MS ago)
// After a successful import it never returns (the hasImport gate). Each
// dismissal snoozes it for SNOOZE_MS; after MAX_DISMISSALS it's gone for good.
const MAX_DISMISSALS = 2;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function allowedByDismissal(d: ImportBannerDismissal | null): boolean {
  if (d === null) return false; // still loading — fail closed (hold hidden)
  if (d.count >= MAX_DISMISSALS) return false;
  if (d.lastDismissedAt === null) return true; // never dismissed
  return Date.now() - d.lastDismissedAt > SNOOZE_MS;
}

/**
 * Drives the dismissable "Coming from TV Time?" home banner. Visibility follows
 * the return-policy state machine above; dismissal is bounded + time-boxed and
 * persists per-user.
 */
export function useTvTimeImportCard(): { visible: boolean; onImport: () => void; onDismiss: () => void } {
  const gate = useTvTimeImportGate();
  const { hasImport, isLoading: hasImportLoading } = useHasTvTimeImport();
  const { user } = useAuth();
  const [dismissal, setDismissal] = useState<ImportBannerDismissal | null>(null);

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
    if (!user) {
      setDismissal((prev) => ({ count: (prev?.count ?? 0) + 1, lastDismissedAt: Date.now() }));
      return;
    }
    void recordImportBannerDismissal(user.id).then(setDismissal);
  }, [user]);

  const visible =
    gate.enabled &&
    !gate.resolving &&
    !hasImportLoading &&
    !hasImport &&
    allowedByDismissal(dismissal);

  return { visible, onImport, onDismiss };
}
