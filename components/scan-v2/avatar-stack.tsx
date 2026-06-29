/**
 * Ticket Scan v2 — `AvatarStack`.
 *
 * Native recreation of the design prototype's `AvatarStack` (`scan-art.jsx`):
 * up to `max` overlapping avatars (newest behind, drawn with a separating ring
 * the color of the surface they sit on) plus a `+N` mono chip when there are
 * more people than shown.
 *
 * Wraps the global `<Avatar>` (photo → initial → DiceBear chain) so a
 * companion's real avatar shows on the dark stub. The separating ring is drawn
 * as an OUTSET wrapper (`backgroundColor: ringColor`, padded) rather than an
 * inset border so overlapping avatars read as distinct discs on the dark
 * surface.
 *
 * Dark-only (built from `ScanV2Colors`), sizes via `s()`.
 */

import React from 'react';
import { View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors } from '@/constants/scan-v2-theme';
import { Avatar } from '@/components/ui/avatar';
import { ScanText } from './primitives';

export interface AvatarStackPerson {
  /** Display name — used for the initial fallback + a11y. */
  name: string;
  /** Profile id (when the companion is a mutual follow) — seeds vector avatars. */
  userId?: string | null;
  /** Uploaded avatar URL (when the companion is a mutual follow). */
  avatarUrl?: string | null;
  updatedAt?: string | null;
}

interface AvatarStackProps {
  people: AvatarStackPerson[];
  max?: number;
  size?: number;
  /** Color of the surface behind the stack — drawn as the separating ring. */
  ringColor: string;
}

export function AvatarStack({ people, max = 3, size = 28, ringColor }: AvatarStackProps) {
  if (!people.length) return null;

  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const ring = Math.max(1.5, size * 0.07);
  const overlap = Math.round(size * 0.34) + ring;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View
          key={p.userId ?? `${p.name}-${i}`}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex: i + 1,
            borderRadius: 999,
            backgroundColor: ringColor,
            padding: ring,
          }}
        >
          <Avatar
            size={size}
            userId={p.userId}
            avatarUrl={p.avatarUrl}
            updatedAt={p.updatedAt}
            name={p.name}
          />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginLeft: -overlap,
            zIndex: max + 1,
            borderRadius: 999,
            backgroundColor: ringColor,
            padding: ring,
          }}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: ScanV2Colors.cardHi,
              borderWidth: 1,
              borderColor: ScanV2Colors.lineHi,
            }}
          >
            <ScanText
              style={{
                fontFamily: Fonts.mono.bold,
                fontSize: Math.round(size * 0.36),
                color: ScanV2Colors.sec,
              }}
            >
              +{extra}
            </ScanText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default AvatarStack;
