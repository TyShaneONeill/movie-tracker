import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { Fonts } from '@/constants/theme';
import type { StatsV2ColorTokens } from '@/constants/stats-v2-theme';

/**
 * Shared paywall gating wrapper for the "Going deeper" premium stats
 * deep-dive screens (vault PS-22) — lifted out of the Rating Personality
 * screen (screen 1) so Blind Spots (screen 2) and future deep-dives reuse
 * the exact same blur + lock pill treatment.
 *
 * Blurs children behind a centered "Unlock" pill for free users; renders
 * children as-is for members. HARD RULE: the caller must pass CANNED
 * placeholder content as `children` while `gated` is true — the blur is
 * garnish, never mounting the user's real data is the actual security (see
 * the paywall pattern note, PR #611).
 */
export function Gated({
  gated,
  c,
  scheme,
  children,
}: {
  gated: boolean;
  c: StatsV2ColorTokens;
  scheme: 'light' | 'dark';
  children: React.ReactNode;
}) {
  if (!gated) return <>{children}</>;
  return (
    <View style={styles.gatedWrap}>
      <View pointerEvents="none">{children}</View>
      {/* dimezisBlurView: without it Android renders a translucent tint, not a
          blur, and the gated content stays legible — see journey/[id].tsx. */}
      <BlurView
        intensity={55}
        tint={scheme === 'light' ? 'light' : 'dark'}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gatedOverlay} pointerEvents="none">
        <View style={[styles.lockPill, { backgroundColor: c.card, borderColor: c.line }]}>
          <Ionicons name="lock-closed" size={14} color={c.gold} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.lockPillText, { color: c.gold }]}>
            Unlock with PocketStubs+
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gatedWrap: {
    position: 'relative',
    // Clip the BlurView to the card radius — unclipped it paints a hard-edged
    // square and the blur bleed reads as oversized smudges.
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
  },
  gatedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  lockPillText: {
    fontFamily: Fonts.inter.bold,
    fontSize: 13,
    lineHeight: 16,
  },
});
