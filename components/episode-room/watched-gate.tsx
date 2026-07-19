/**
 * WatchedGate — the HARD spoiler blocker over an unwatched Episode Room
 * (Decision, Ty 2026-07-19 — no peek, no bypass). The caller renders this
 * INSTEAD of the take stream and never fetches take content while it shows, so
 * nothing spoilery is in memory — there is deliberately no blurred/placeholder
 * take content behind it to leak.
 *
 * The CTA routes to the show detail, where the user marks the episode watched;
 * marking-in-place is intentionally out of the day-1 cut.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface WatchedGateProps {
  episodeLabel: string;
  onMarkWatched: () => void;
}

export function WatchedGate({ episodeLabel, onMarkWatched }: WatchedGateProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={34} color={colors.tint} style={styles.icon} />
      <Text style={[styles.title, { color: colors.text }]}>Mark it watched to join the room</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Takes on {episodeLabel} stay spoiler-free until you&rsquo;ve seen it.
      </Text>
      <Pressable
        onPress={onMarkWatched}
        accessibilityRole="button"
        accessibilityLabel="Go to show to mark this episode watched"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.ctaText}>Mark as watched</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 250,
    marginBottom: 20,
  },
  cta: {
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
