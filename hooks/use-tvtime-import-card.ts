import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { isImportCardDismissed, dismissImportCard } from '@/lib/tvtime-import';

/**
 * Drives the dismissable "Coming from TV Time?" entry card shown on the home
 * feed and the onboarding completion screen. Visible only while the feature is
 * enabled and the user hasn't dismissed it. Dismissal persists per-user.
 */
export function useTvTimeImportCard(): { visible: boolean; onImport: () => void; onDismiss: () => void } {
  const gate = useTvTimeImportGate();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setDismissed(false);
      return;
    }
    isImportCardDismissed(user.id).then((d) => {
      if (!cancelled) setDismissed(d);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onImport = useCallback(() => {
    router.push('/settings/tvtime-import');
  }, []);

  const onDismiss = useCallback(() => {
    setDismissed(true);
    if (user) void dismissImportCard(user.id);
  }, [user]);

  return {
    visible: gate.enabled && !gate.resolving && dismissed === false,
    onImport,
    onDismiss,
  };
}
