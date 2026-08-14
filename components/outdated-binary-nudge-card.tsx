import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { hapticImpact } from '@/lib/haptics';
import { useOutdatedBinaryNudge } from '@/hooks/use-outdated-binary-nudge';

function DownloadIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
    </Svg>
  );
}

function ChevronRightIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

function CloseIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

const COPY = {
  recommended: {
    title: 'A new cut is out',
    body: 'Update PocketStubs to get the latest.',
    accessibilityLabel: 'Update PocketStubs',
  },
  minimum: {
    title: 'This version has retired',
    body: 'Update PocketStubs to keep everything working.',
    accessibilityLabel: 'Update PocketStubs, this version is no longer supported',
  },
} as const;

/**
 * Outdated-binary nudge (#726) — self-gating home card in the
 * "Coming from TV Time?" idiom. Renders nothing (no wrapper, no phantom gap)
 * unless the running binary is behind the store.
 *
 * The 'recommended' tier is dismissible and snoozes; the 'minimum' tier has no
 * dismiss affordance but never blocks the app — the user can scroll straight
 * past it.
 */
export function OutdatedBinaryNudgeCard() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { tier, onDismiss, onUpdate } = useOutdatedBinaryNudge();

  if (tier === 'none') return null;

  const copy = COPY[tier];
  const dismissible = tier === 'recommended';

  const handlePress = () => {
    hapticImpact();
    onUpdate();
  };

  const handleDismiss = () => {
    hapticImpact();
    onDismiss();
  };

  return (
    <View style={styles.slot}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.tint },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={copy.accessibilityLabel}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.backgroundSecondary }]}>
          <DownloadIcon color={colors.tint} size={20} />
        </View>
        <View style={styles.body}>
          <Text style={[Typography.body.base, styles.title, { color: colors.text }]}>
            {copy.title}
          </Text>
          <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>{copy.body}</Text>
          <View style={styles.ctaRow}>
            <Text style={[Typography.body.sm, styles.cta, { color: colors.tint }]}>UPDATE</Text>
            <ChevronRightIcon color={colors.tint} size={16} />
          </View>
        </View>
        {dismissible && (
          <Pressable
            onPress={handleDismiss}
            hitSlop={10}
            style={styles.dismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <CloseIcon color={colors.textTertiary} size={18} />
          </Pressable>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontWeight: '800' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  cta: { fontWeight: '800', letterSpacing: 0.5 },
  dismiss: { padding: 4, alignSelf: 'flex-start' },
});
