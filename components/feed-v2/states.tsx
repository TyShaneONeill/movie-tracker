/**
 * States — empty / skeleton for the Feed v2 screen (contract note F). Empty is
 * the lobby invitation ("The lobby is quiet" + Find people), not an apology.
 * Skeleton shimmers stub-shaped rows and respects Reduce Motion (static when
 * reduced), matching the profile v2 skeleton pattern.
 */

import { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useReducedMotion } from '@/components/onboarding/v2/shared/use-reduced-motion';

export function FeedV2Empty({ onFindPeople }: { onFindPeople: () => void }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';

  return (
    <View style={[styles.empty, { borderColor: dashColor }]}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>The lobby is quiet</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        Follow a few cinephiles and their stubs and reviews land here the moment the credits roll.
      </Text>
      <Pressable
        onPress={onFindPeople}
        accessibilityRole="button"
        accessibilityLabel="Find people"
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.ctaText}>Find people</Text>
      </Pressable>
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

  return (
    <View style={styles.skelGroup}>
      <Animated.View style={[styles.skelAttr, { backgroundColor: shimmer, opacity }]} />
      <Animated.View style={[styles.skelCard, { backgroundColor: shimmer, opacity }]} />
    </View>
  );
}

export function FeedV2Skeleton() {
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

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 2,
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
    marginTop: 8,
  },
  skelGroup: {
    marginTop: 14,
    gap: 8,
  },
  skelAttr: {
    height: 16,
    width: '55%',
    borderRadius: 8,
    marginHorizontal: 2,
  },
  skelCard: {
    height: 96,
    borderRadius: BorderRadius.md,
    marginHorizontal: 2,
  },
});
