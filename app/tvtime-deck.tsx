/**
 * Route for the TV Time blank-stubs rating deck (PR 4). Gated on the
 * `tvtime_import_deck` flag — a SEPARATE kill switch from the import flow.
 *
 * Fails closed: while PostHog resolves the flag we hold a neutral screen (no
 * v1/v2 flash, no premature bounce); once resolved, a disabled flag replaces the
 * route back to Home so the deck can never be reached with the flag off.
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useTvTimeImportDeckGate } from '@/hooks/use-tvtime-deck';
import { TvTimeDeckScreen } from '@/components/tvtime-deck/deck-screen';

export default function TvTimeDeckRoute() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { enabled, resolving } = useTvTimeImportDeckGate();

  useEffect(() => {
    if (!resolving && !enabled) router.replace('/');
  }, [resolving, enabled]);

  if (resolving || !enabled) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return <TvTimeDeckScreen />;
}
