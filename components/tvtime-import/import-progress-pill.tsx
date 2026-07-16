import React, { useEffect, useMemo, useRef } from 'react';
import { Text, StyleSheet, Animated, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';

import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { hapticImpact } from '@/lib/haptics';
import { useTvTimeImportGate } from '@/hooks/use-tvtime-import';
import { useImportRun } from '@/lib/tvtime-import/import-run-context';
import { importPillView } from '@/lib/tvtime-import/import-run-view';
import { TicketIcon } from './icons';

// A small non-blocking pill that surfaces an in-flight import while the user is
// anywhere EXCEPT the import screen — so tapping "Hide" no longer leaves them in
// the dark. Tapping returns to the (re-attaching) import screen. On completion
// it flips to "Import complete" and auto-dismisses; on failure it says "needs a
// look". Mirrors the OfflineBanner mount pattern (rendered once in _layout).
const AUTO_DISMISS_MS = 5000;
// Clears the bottom tab bar (~56pt) plus a margin so the pill is always tappable
// above it on the main tab screens.
const TAB_BAR_CLEARANCE = 72;

export function ImportProgressPill() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { phase, progress, screenFocused, reset } = useImportRun();
  const gate = useTvTimeImportGate();
  const pathname = usePathname();

  // Visible whenever an import is active/finished AND the user isn't on the
  // import screen. Flag-gated like the rest of the feature.
  const { visible: visibleRaw, label, running, kind } = importPillView({
    enabled: gate.enabled,
    phase,
    screenFocused,
    processed: progress.processed,
    total: progress.total,
  });
  // Never render over the full-screen import FLOW routes: the import screen
  // (which shows its own UI) or the blank-stubs deck (a tabless route reached
  // from the done screen — a bottom-pinned pill there collides with the deck's
  // own footer and the home-indicator area). The pill is for the main tab
  // screens where the user waits during a background import.
  const onFlowRoute =
    !!pathname &&
    (pathname.startsWith('/tvtime-deck') || pathname.startsWith('/settings/tvtime-import'));
  const visible = visibleRaw && !onFlowRoute;

  const translateY = useRef(new Animated.Value(120)).current;
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : 120,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible, translateY]);

  // Auto-dismiss the completed/errored pill after a few seconds (the data is
  // already imported; the done screen remains reachable from Settings → Import).
  useEffect(() => {
    if (!visible || phase === 'running') return;
    const t = setTimeout(() => reset(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, phase, reset]);

  const accent = kind === 'error' ? '#f59e0b' : colors.tint;

  const onPress = () => {
    hapticImpact();
    router.push('/settings/tvtime-import');
  };

  return (
    <Animated.View
      // Sit ABOVE the bottom tab bar (~56pt + safe area) so the pill never
      // collides with a tab target on the main screens where the user waits.
      style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_CLEARANCE, transform: [{ translateY }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pill, { backgroundColor: colors.card, borderColor: accent }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Tap to open.`}
      >
        {running ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <TicketIcon color={accent} size={18} />
        )}
        <Text style={[Typography.body.sm, styles.text, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: typeof Colors.dark) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      // On Android draw order is governed by `elevation`, not `zIndex` — a bare
      // zIndex lets a FAB (elevation ~6) paint over the pill. Carry a matching
      // elevation on the wrap AND the pill so the pill always stacks on top.
      zIndex: 9998,
      elevation: 24,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: Spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: '90%',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 24,
    },
    text: { fontWeight: '700', flexShrink: 1 },
  });
}
