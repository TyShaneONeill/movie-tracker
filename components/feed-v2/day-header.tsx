/**
 * DayHeader — the projectionist's log line (contract note D). TODAY / YESTERDAY /
 * THIS WEEK / an absolute date, rendered as a small uppercase eyebrow. The feed
 * is genuinely chronological, so the structure encodes truth.
 */

import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export function DayHeader({ label }: { label: string }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return <Text style={[styles.label, { color: colors.textTertiary }]}>{label.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 2,
    marginHorizontal: 2,
  },
});
