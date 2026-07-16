import React, { useEffect, useMemo, useRef } from 'react';
import { Text, StyleSheet, Animated, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

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

export function ImportProgressPill() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { phase, progress, screenFocused, reset } = useImportRun();
  const gate = useTvTimeImportGate();

  // Visible whenever an import is active/finished AND the user isn't on the
  // import screen. Flag-gated like the rest of the feature.
  const { visible, label, running, kind } = importPillView({
    enabled: gate.enabled,
    phase,
    screenFocused,
    processed: progress.processed,
    total: progress.total,
  });

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
      style={[styles.wrap, { bottom: insets.bottom + Spacing.md, transform: [{ translateY }] }]}
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
      zIndex: 9998,
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
      elevation: 4,
    },
    text: { fontWeight: '700', flexShrink: 1 },
  });
}
