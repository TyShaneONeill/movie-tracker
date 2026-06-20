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

import { buildAvatarUrl } from '@/lib/avatar-service';
import {
  avatarSvg,
  avatarCacheKey,
  BACKGROUNDS,
  type AvatarConfig,
  type AvatarType,
} from '@/lib/avatar-config';

const GEN_SIZE = 128; // canonical render size; SvgXml scales to the requested size

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

  // Resolve mode. Explicit avatarType wins; otherwise infer (legacy-compatible).
  let mode: 'photo' | 'initial' | 'vector';
  if (avatarType === 'photo') mode = photoUrl ? 'photo' : 'vector';
  else if (avatarType === 'initial') mode = 'initial';
  else if (avatarType === 'preset' || avatarType === 'auto') mode = 'vector';
  else mode = photoUrl ? 'photo' : 'vector';

  const svg = useMemo(
    () => (mode === 'vector' ? avatarSvg(seed, config, GEN_SIZE) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, avatarCacheKey(seed, config, GEN_SIZE)],
  );

  const container: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
    borderWidth > 0 && borderColor ? { borderWidth, borderColor } : null,
    style,
  ];

  const a11y = {
    accessible: true,
    accessibilityRole: 'image' as const,
    accessibilityLabel: name ? `${name}'s avatar` : 'User avatar',
  };

  if (mode === 'photo' && photoUrl) {
    return (
      <Image
        {...a11y}
        source={{ uri: photoUrl }}
        style={container as StyleProp<ImageStyle>}
        contentFit="cover"
        transition={200}
      />
    );
  }

  if (mode === 'initial') {
    const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?';
    const bg = config?.backgroundColor ?? pickBackground(seed);
    return (
      <View {...a11y} style={[container, styles.center, { backgroundColor: `#${bg}` }]}>
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
      </View>
    );
  }

  return (
    <View {...a11y} style={container}>
      {svg ? <SvgXml xml={svg} width={size} height={size} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#18181b', fontWeight: '700' },
});

export default Avatar;
