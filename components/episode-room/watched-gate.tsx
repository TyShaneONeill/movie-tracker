/**
 * WatchedGate — the HARD spoiler blocker over an unwatched Episode Room
 * (Decision, Ty 2026-07-19 — no peek, no bypass). The caller renders this
 * INSTEAD of the take stream and never fetches take content while it shows, so
 * nothing spoilery is in memory. The dimmed skeleton behind the scrim is inert
 * placeholder geometry (plain Views) — it is not real take data.
 *
 * The CTA routes to the show detail, where the user marks the episode watched;
 * marking-in-place is intentionally out of the day-1 cut.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface WatchedGateProps {
  episodeLabel: string;
  onMarkWatched: () => void;
}

export function WatchedGate({ episodeLabel, onMarkWatched }: WatchedGateProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';

  return (
    <View style={styles.wrap}>
      {/* Inert placeholder geometry — signals "there's a room here", holds no data. */}
      <View style={styles.placeholder} pointerEvents="none">
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.skel,
              { backgroundColor: colors.card, opacity: 0.5 - i * 0.12 },
            ]}
          />
        ))}
      </View>

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
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1, borderColor: dashColor },
          ]}
        >
          <Text style={styles.ctaText}>Mark as watched</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    position: 'relative',
  },
  placeholder: {
    gap: 12,
    marginBottom: -180,
  },
  skel: {
    height: 84,
    borderRadius: BorderRadius.md,
  },
  card: {
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
