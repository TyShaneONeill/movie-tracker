import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { hapticImpact } from '@/lib/haptics';
import { TicketIcon, ChevronRightIcon, CloseIcon } from './icons';

interface TvTimeImportCardProps {
  onPress: () => void;
  /** When provided, renders a dismiss affordance (home + onboarding). */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Coming from TV Time?" entry card. Shared by the home feed and the onboarding
 * completion screen — both dismissable, never placed inside required onboarding
 * steps. Vector icon, approved copy, theme-aware.
 */
export function TvTimeImportCard({ onPress, onDismiss, style }: TvTimeImportCardProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const handlePress = () => {
    hapticImpact();
    onPress();
  };

  const handleDismiss = () => {
    hapticImpact();
    onDismiss?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.tint },
        pressed && { opacity: 0.9 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Import from TV Time"
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.backgroundSecondary }]}>
        <TicketIcon color={colors.tint} size={20} />
      </View>
      <View style={styles.body}>
        <Text style={[Typography.body.base, styles.title, { color: colors.text }]}>
          Coming from TV Time?
        </Text>
        <Text style={[Typography.body.sm, { color: colors.textSecondary }]}>
          Bring your history home.
        </Text>
        <View style={styles.ctaRow}>
          <Text style={[Typography.body.sm, styles.cta, { color: colors.tint }]}>IMPORT NOW</Text>
          <ChevronRightIcon color={colors.tint} size={16} />
        </View>
      </View>
      {onDismiss && (
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
  );
}

const styles = StyleSheet.create({
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
