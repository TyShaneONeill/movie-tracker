/**
 * WatchedGate — the HARD spoiler blocker over an unwatched Episode Room
 * (Decision, Ty 2026-07-19 — no peek, no bypass). The caller renders this
 * INSTEAD of the take stream and never fetches take content while it shows, so
 * nothing spoilery is in memory — there is deliberately no blurred/placeholder
 * take content behind it to leak.
 *
 * "Mark as watched" unlocks IN PLACE (Ty, 2026-07-19): the caller runs the
 * mark-watched mutation and then flips `unlocking` — the lock springs open,
 * the veil lifts, and `onUnlocked` fires so the caller can reveal the room.
 * The caller flips the watched probe only AFTER onUnlocked, so the veil isn't
 * yanked out mid-animation.
 */

import { useEffect, useRef, useState } from 'react';
import { Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { hapticImpact } from '@/lib/haptics';

interface WatchedGateProps {
  episodeLabel: string;
  onMarkWatched: () => void;
  /** Mark-watched mutation in flight — CTA disables and reads "Marking…". */
  pending?: boolean;
  /** Flips true after a successful mark — plays the unlock animation. */
  unlocking?: boolean;
  /** Fires once the unlock animation completes; the caller reveals the room. */
  onUnlocked?: () => void;
}

export function WatchedGate({
  episodeLabel,
  onMarkWatched,
  pending = false,
  unlocking = false,
  onUnlocked,
}: WatchedGateProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const [open, setOpen] = useState(false);
  const iconScale = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardShift = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  useEffect(() => {
    if (!unlocking || started.current) return;
    started.current = true;
    hapticImpact();
    setOpen(true);
    Animated.sequence([
      // The lock springs open…
      Animated.spring(iconScale, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 22,
        bounciness: 14,
      }),
      Animated.timing(iconScale, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.delay(260),
      // …then the veil lifts.
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardShift, {
          toValue: 22,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onUnlockedRef.current?.();
    });
  }, [unlocking, iconScale, cardOpacity, cardShift]);

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        { opacity: cardOpacity, transform: [{ translateY: cardShift }] },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>
        <Ionicons
          name={open ? 'lock-open-outline' : 'lock-closed-outline'}
          size={34}
          color={colors.tint}
          style={styles.icon}
        />
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>
        {open ? 'Welcome to the room' : 'Mark it watched to join the room'}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Takes on {episodeLabel} stay spoiler-free until you&rsquo;ve seen it.
      </Text>
      <Pressable
        onPress={onMarkWatched}
        disabled={pending || unlocking}
        accessibilityRole="button"
        accessibilityLabel="Mark this episode watched and enter the room"
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: colors.tint,
            opacity: pressed || pending || unlocking ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.ctaText}>
          {unlocking ? 'Unlocked' : pending ? 'Marking…' : 'Mark as watched'}
        </Text>
      </Pressable>
    </Animated.View>
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
