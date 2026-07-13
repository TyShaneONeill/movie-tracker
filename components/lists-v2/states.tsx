/**
 * Loading / error states for the Lists v2 tab (contract, states requirement).
 * Theme-aware; the skeleton mirrors the programme-card rhythm.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export function ListsSkeleton() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <View style={styles.wrap} accessibilityLabel="Loading lists" accessibilityRole="progressbar">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.line, { backgroundColor: colors.border, width: '45%' }]} />
          <View style={[styles.block, { backgroundColor: colors.border }]} />
        </View>
      ))}
    </View>
  );
}

export function ListsError({ onRetry }: { onRetry: () => void }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <View style={styles.errorWrap}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>We couldn&apos;t load your lists.</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [styles.retry, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  line: {
    height: 14,
    borderRadius: 4,
    marginBottom: 14,
  },
  block: {
    height: 118,
    borderRadius: 8,
    opacity: 0.5,
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  retry: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
