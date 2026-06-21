/**
 * <Avatar> — the single source of truth for rendering a user's avatar anywhere
 * in the app. Resolves, in order:
 *   1. photo        — uploaded image (existing behavior, preserved)
 *   2. initial       — first-letter monogram (Phase 2 "use my initial" mode)
 *   3. vector        — generated DiceBear avatar (auto-seeded or customized)
 *
 * Phase 1: there are no `avatar_type` / `avatar_config` columns yet, so the
 * resolution falls back to: photo if `avatarUrl` is present, otherwise a
 * deterministic vector avatar seeded from the user id. This means every user —
 * new or existing, with or without a photo — gets a real avatar with zero DB
 * changes and no backfill.
 *
 * The generated SVG is memoized by (seed, config) and produced once at a
 * canonical resolution, then scaled by SvgXml — so list-heavy screens don't
 * re-parse SVG on every render.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type ViewStyle, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { buildAvatarUrl } from '@/lib/avatar-service';
import { analytics } from '@/lib/analytics';
import { ONBOARDING_V2_FLAG } from '@/hooks/use-onboarding-variant';
import { useAvatarOverrides } from '@/hooks/use-avatar-overrides';
import {
  avatarSvg,
  avatarCacheKey,
  BACKGROUNDS,
  type AvatarConfig,
  type AvatarType,
} from '@/lib/avatar-config';

const GEN_SIZE = 128; // canonical render size; SvgXml scales to the requested size

// Legacy gray "person" placeholder — the final fallback when a user has no
// photo, no saved avatar, and no name to derive an initial from.
const DEFAULT_BG = '#e4e4e7';
const DEFAULT_ICON = '#9ca3af';

// The avatar feature ships in lockstep with onboarding v2 — gated behind the
// same flag (with the same dev/QA env override). When off, avatars fall back to
// photo-or-initial and no vector avatars render. Read literally so Metro can
// inline the env var in production bundles.
const ENV_V2_OVERRIDE = process.env.EXPO_PUBLIC_ONBOARDING_V2_OVERRIDE;
function avatarsEnabled(): boolean {
  if (ENV_V2_OVERRIDE === 'true') return true;
  if (ENV_V2_OVERRIDE === 'false') return false;
  return analytics.isFeatureEnabled(ONBOARDING_V2_FLAG);
}

export interface AvatarProps {
  size: number;
  /** Seed for the generated vector avatar — pass the user id for stability. */
  userId?: string | null;
  avatarUrl?: string | null;
  updatedAt?: string | null;
  /** Display name — used for the initial-monogram mode and accessibility. */
  name?: string | null;
  /** Stored customization (Phase 2). */
  config?: AvatarConfig | null;
  /** Explicit resolution. When omitted, inferred from the data present. */
  avatarType?: AvatarType | null;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
}

function pickBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BACKGROUNDS[h % BACKGROUNDS.length].id;
}

export function Avatar({
  size,
  userId,
  avatarUrl,
  updatedAt,
  name,
  config,
  avatarType,
  borderColor,
  borderWidth = 0,
  style,
}: AvatarProps) {
  const seed = userId || name || 'pocketstubs';
  const photoUrl = buildAvatarUrl(avatarUrl, updatedAt);
  const enabled = avatarsEnabled();

  // When this site didn't pass an explicit type/config (feed, comments, social
  // lists, reviews…), fall back to the centralized customization lookup so a
  // user's customized avatar shows everywhere — not just on their profile.
  const { data: overrides } = useAvatarOverrides(enabled);
  const override = enabled && !avatarType && userId ? overrides?.[userId] : undefined;
  const effType = avatarType ?? override?.avatarType;
  const effConfig = config ?? override?.avatarConfig ?? null;

  // Resolution follows the product fallback chain:
  //   saved photo / legacy photo → saved vector avatar (preset) → initial letter
  //   → gray default image (no name).
  // Auto-assign is OFF: an uncustomized user shows their initial letter, NOT a
  // generated avatar. A vector avatar only renders once explicitly saved
  // (avatar_type 'preset'). A saved 'initial' choice wins over a stale photo.
  let mode: 'photo' | 'initial' | 'vector';
  if (enabled && effType === 'preset') {
    mode = 'vector';
  } else if (photoUrl && effType !== 'initial') {
    mode = 'photo';
  } else {
    mode = 'initial';
  }

  const svg = useMemo(
    () => (mode === 'vector' ? avatarSvg(seed, effConfig, GEN_SIZE) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, avatarCacheKey(seed, effConfig, GEN_SIZE)],
  );

  const a11y = {
    accessible: true,
    accessibilityRole: 'image' as const,
    accessibilityLabel: name ? `${name}'s avatar` : 'User avatar',
  };

  // Render content full-bleed inside a circular clip. The border is drawn as a
  // separate overlay ring so it never insets/offsets the content — otherwise an
  // RN border pushes the avatar down-and-right inside the ring (off-center).
  let content: React.ReactNode = null;
  if (mode === 'photo' && photoUrl) {
    content = (
      <Image
        source={{ uri: photoUrl }}
        style={styles.fill as StyleProp<ImageStyle>}
        contentFit="cover"
        transition={200}
      />
    );
  } else if (mode === 'initial') {
    const trimmed = (name ?? '').trim();
    const initial = trimmed ? trimmed[0].toUpperCase() : null;
    if (initial) {
      const bg = effConfig?.backgroundColor ?? pickBackground(seed);
      content = (
        <View style={[styles.fill, styles.center, { backgroundColor: `#${bg}` }]}>
          <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
        </View>
      );
    } else {
      // Final fallback: legacy gray "person" placeholder when there's no name.
      content = (
        <View style={[styles.fill, styles.center, { backgroundColor: DEFAULT_BG }]}>
          <Ionicons name="person" size={size * 0.5} color={DEFAULT_ICON} />
        </View>
      );
    }
  } else if (svg) {
    content = <SvgXml xml={svg} width={size} height={size} />;
  }

  return (
    <View {...a11y} style={[{ width: size, height: size }, style]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        {content}
      </View>
      {borderWidth > 0 && borderColor ? (
        <View
          pointerEvents="none"
          style={[styles.ring, { borderRadius: size / 2, borderWidth, borderColor }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  center: { justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#18181b', fontWeight: '700' },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});

export default Avatar;
