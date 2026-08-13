import React, { Suspense, useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';

// Defer the heavy import screen (fflate unzip + parser + matcher + the file
// picker) until the route actually renders. The lazy boundary code-splits
// the heavy module and keeps the route file itself trivial, mirroring
// app/(tabs)/scanner.tsx.
//
// NOTE (post-#815): this screen's module graph now includes
// @react-native-documents/picker (issue #810's fullScreen picker fix) —
// that IS a new native module, unlike the fflate/expo-document-picker path
// this comment used to describe. It is NOT statically imported anywhere
// (see lib/pick-document.ts), so this lazy boundary is no longer what keeps
// an OTA update safe on a binary that predates the dependency. That safety
// is now entirely lib/pick-document.ts's requireNativePicker()'s
// try/catch — it lazy-requires the native module and falls back to
// expo-document-picker if the require throws (module not registered).
// That try/catch is LOAD-BEARING: do not remove it as cleanup, and do not
// convert its require() to a static import.
const TvTimeImportScreen = React.lazy(() =>
  import('@/components/tvtime-import/tvtime-import-screen').then((m) => ({ default: m.TvTimeImportScreen }))
);

export default function TvTimeImportRoute() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { user, isLoading: authLoading } = useAuth();
  const { enabled, resolving } = useTvTimeImportGate();

  // Auth gate FIRST: the import writes user_tv_shows / user_episode_watches /
  // user_movies rows keyed on a user_id, so a guest (browse-anywhere mode is the
  // default on web and opt-in on native) or any not-yet-signed-in user must never
  // reach the pick screen. Once auth resolves with no user, send them to sign-in.
  // Then the hard flag gate (rollout control) holds even for a cached deep link.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/(auth)/signin');
      return;
    }
    if (!resolving && !enabled) router.replace('/settings');
  }, [authLoading, user, resolving, enabled]);

  if (authLoading || !user || resolving || !enabled) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Suspense fallback={<View style={{ flex: 1, backgroundColor: colors.background }} />}>
      <TvTimeImportScreen />
    </Suspense>
  );
}
