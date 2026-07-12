/**
 * States — empty / skeleton / error for the First Takes v2 tab (contract note G).
 *
 * Empty = the blank stub-back (dashed) with the lobby-note copy + a "Log a film"
 * CTA (own profile only). Skeleton = 3 shimmering stub rows that respect Reduce
 * Motion (static when reduced). Error keeps the retry affordance. All three
 * replace the generic legacy versions.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';

/** A dashed blank stub-back. Own profile gets the writerly copy + CTA. */
export function FirstTakesEmpty({
  isOwn,
  onLogFilm,
}: {
  isOwn: boolean;
  onLogFilm?: () => void;
}) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';

  return (
    <View style={[styles.empty, { borderColor: dashColor }]}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {isOwn ? 'Nothing logged yet' : 'No first takes yet'}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        {isOwn
          ? 'A first take is the note you scribble in the lobby — get it down while it’s still warm.'
          : 'This user hasn’t shared any first takes.'}
      </Text>
      {isOwn && onLogFilm && (
        <Pressable
          onPress={onLogFilm}
          accessibilityRole="button"
          accessibilityLabel="Log a film"
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>Log a film</Text>
        </Pressable>
      )}
    </View>
  );
}

function SkeletonRow({ shimmer, delay }: { shimmer: string; delay: number }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(0.4);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 700, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, reduced, delay]);

  return <Animated.View style={[styles.skel, { backgroundColor: shimmer, opacity }]} />;
}

export function FirstTakesSkeleton() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <View style={styles.skelWrap}>
      {[0, 1, 2].map((i) => (
        <SkeletonRow key={i} shimmer={colors.card} delay={i * 180} />
      ))}
    </View>
  );
}

export function FirstTakesError({
  onRetry,
  message = "We couldn't load these first takes.",
}: {
  onRetry: () => void;
  /** Body copy — defaults to the First Takes phrasing; Reviews passes its own. */
  message?: string;
}) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  return (
    <View style={styles.errorWrap}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.tint} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        {message}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.ctaText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 260,
    marginBottom: 16,
  },
  cta: {
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  skelWrap: {
    gap: 12,
    marginTop: 14,
  },
  skel: {
    height: 84,
    borderRadius: BorderRadius.md,
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
});
