/**
 * Ticket Scan v2 — `JourneyCard` (the v2 `JourneyTicket`).
 *
 * Native re-skin of the design prototype's `JourneyTicket` (`scan-screens3.jsx`)
 * over the EXISTING v1 journey data (`UserMovie` + joined `first_takes`). Display
 * only — the edit pencil routes to the v1 edit screen (PR 5 swaps it for the v2
 * EditSheet).
 *
 * FRONT — a poster (Original / AI art) with glass flip + edit buttons, an
 * Original|AI segmented glass pill (bottom-left), and a rose watch-context tag
 * (label from `location_type`), a perforation seam (dashed line + two
 * bg-colored notch circles), then a FIXED-HEIGHT stub (`stubHeight` prop —
 * layout constant, never content-sized, so the seam sits at the same Y on
 * every card): one-line title + rating chip, priority fields (Date ·
 * Cinema/Service/Airline-or-Format · With), and a 2-page carousel row
 * ("Your First Take") whose space is always reserved.
 *
 * BACK — a crossfade (the inner face is keyed on `flipped` so it re-mounts and
 * fades; NO 3D transform): an emerald "Verified theater visit" pill, a
 * decorative barcode, the real `ticket_id` confirmation code, and a footer.
 *
 * Theme-aware (built from `useScanColors`/`ScanV2Accent`, never the theme-aware
 * `Colors`); text via `ScanText`, sizes via `s()`.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Pressable, Animated } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { useScanColors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { getTMDBImageUrl } from '@/lib/tmdb.types';
import { SignedPhoto } from '@/components/journey/signed-photo';
import {
  buildPlaceField,
  formatStubDate as formatDate,
  getWatchContextLabel,
} from '@/lib/scan-v2/journey-stub-fields';
import type { UserMovie, FirstTake } from '@/lib/database.types';
import { Icon, ScanText } from './primitives';
import { AvatarStack, type AvatarStackPerson } from './avatar-stack';

// ============================================================================
// Layout constants — card geometry NEVER derives from data or state
// ============================================================================

/**
 * Minimum fixed height of the stub slab (in `s()` units). The screen computes
 * the actual stub height once from layout constants (viewport slot minus a
 * ~2:3 poster) and passes it down — identical for every card in the pager.
 */
export const JOURNEY_STUB_MIN_HEIGHT = 158;

/** Poster height/width target — full 2:3 movie-poster aspect. */
export const JOURNEY_POSTER_ASPECT = 1.5;

function formatPrice(price: number | null): string | null {
  if (price === null || price === undefined) return null;
  return `$${price.toFixed(2)}`;
}

function buildSeat(journey: UserMovie): { label: string; value: string } | null {
  const seat = journey.seat_location?.trim() || null;
  const aud = journey.auditorium?.trim() || null;
  if (seat && aud) return { label: 'Seat · Aud', value: `${seat} · ${aud}` };
  if (seat) return { label: 'Seat', value: seat };
  if (aud) return { label: 'Aud', value: aud };
  return null;
}

interface StubFieldData {
  label: string;
  value?: string | null;
  node?: React.ReactNode;
}

// ============================================================================
// Crossfade — fades a fresh face in on mount (re-mount via key change)
// ============================================================================

function FadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

// ============================================================================
// Glass round button (flip / edit overlay on the poster)
// ============================================================================

function GlassButton({
  onPress,
  side,
  children,
}: {
  onPress: () => void;
  side: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        top: s(12),
        [side]: s(12),
        width: s(36),
        height: s(36),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
      }}
    >
      {children}
    </Pressable>
  );
}

// Flip glyph — not in the shared Icon set, so drawn inline (design `flip` path).
function FlipGlyph({ size, color }: { size: number; color: string }) {
  const p = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...p} d="M4 9a8 8 0 0 1 14-3l2 2" />
      <Path {...p} d="M20 5v4h-4" />
      <Path {...p} d="M20 15a8 8 0 0 1-14 3l-2-2" />
      <Path {...p} d="M4 19v-4h4" />
    </Svg>
  );
}

// ============================================================================
// ArtSegmentedPill — Original | ✦ AI glass segmented control on the poster
// ============================================================================

function ArtSegmentedPill({
  showAi,
  onSelect,
}: {
  showAi: boolean;
  onSelect: (variant: 'original' | 'ai') => void;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: s(12),
        bottom: s(12),
        flexDirection: 'row',
        padding: s(3),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        backgroundColor: 'rgba(0,0,0,0.45)',
        zIndex: 3,
      }}
    >
      {(
        [
          ['original', 'Original'],
          ['ai', 'AI'],
        ] as const
      ).map(([variant, label]) => {
        const on = variant === 'ai' ? showAi : !showAi;
        return (
          <Pressable
            key={variant}
            onPress={() => onSelect(variant)}
            hitSlop={6}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: s(4),
              height: s(26),
              paddingHorizontal: s(11),
              borderRadius: 999,
              backgroundColor: on
                ? variant === 'ai'
                  ? ScanV2Accent.primary
                  : 'rgba(255,255,255,0.92)'
                : 'transparent',
            }}
          >
            {variant === 'ai' ? (
              <Icon name="sparkle" size={s(12)} color={on ? ScanV2Accent.on : 'rgba(255,255,255,0.85)'} />
            ) : null}
            <ScanText
              style={{
                fontFamily: Fonts.inter.semibold,
                fontSize: s(12),
                lineHeight: s(15),
                color: on ? (variant === 'ai' ? ScanV2Accent.on : '#18181b') : 'rgba(255,255,255,0.85)',
              }}
            >
              {label}
            </ScanText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ============================================================================
// Perforation seam — dashed line + two bg-colored notch circles
// ============================================================================

const SEAM_DASHES = 22;

function PerforationSeam() {
  const c = useScanColors();
  const notch = s(11);
  return (
    <View style={{ height: 0, zIndex: 2 }}>
      <View
        style={{
          position: 'absolute',
          left: s(13),
          right: s(13),
          top: -1,
          height: 2,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {Array.from({ length: SEAM_DASHES }).map((_, i) => (
          <View key={i} style={{ width: s(7), height: s(2), borderRadius: 1, backgroundColor: c.sec }} />
        ))}
      </View>
      <View
        style={{
          position: 'absolute',
          left: -notch,
          top: -notch,
          width: notch * 2,
          height: notch * 2,
          borderRadius: notch,
          backgroundColor: c.bg,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: -notch,
          top: -notch,
          width: notch * 2,
          height: notch * 2,
          borderRadius: notch,
          backgroundColor: c.bg,
        }}
      />
    </View>
  );
}

// ============================================================================
// Decorative barcode (vertical bars — not a real scannable code)
// ============================================================================

const BAR_WIDTHS = [
  2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 1, 2,
  3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1,
];

function Barcode({ height, color }: { height: number; color: string }) {
  const VB_W = 176;
  const VB_H = 45;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
      {BAR_WIDTHS.map((w, index) => {
        const x = BAR_WIDTHS.slice(0, index).reduce((sum, bw) => sum + bw + 2, 0);
        if (x + w > VB_W) return null;
        return <Rect key={index} x={x} y={0} width={w} height={VB_H} fill={color} />;
      })}
    </Svg>
  );
}

// ============================================================================
// StubField — renders nothing when empty
// ============================================================================

function StubField({ label, value, node }: StubFieldData) {
  const c = useScanColors();
  if (!value && !node) return null;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <ScanText
        numberOfLines={1}
        style={{
          fontFamily: Fonts.mono.medium,
          fontSize: s(10),
          lineHeight: s(13),
          letterSpacing: 1.3,
          color: c.ter,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </ScanText>
      {node ? (
        <View style={{ marginTop: s(5), flexDirection: 'row', alignItems: 'center' }}>{node}</View>
      ) : (
        <ScanText
          numberOfLines={1}
          style={{
            fontFamily: Fonts.inter.semibold,
            fontSize: s(15),
            color: c.text,
            marginTop: s(3),
            lineHeight: s(19),
          }}
        >
          {value}
        </ScanText>
      )}
    </View>
  );
}

// ============================================================================
// JourneyCard
// ============================================================================

export interface JourneyCardProps {
  journey: UserMovie;
  firstTake: FirstTake | null;
  companions: AvatarStackPerson[];
  /** Whether the AI poster is the active variant (derived from display_poster). */
  showAi: boolean;
  flipped: boolean;
  onFlip: () => void;
  page: number;
  setPage: (page: number) => void;
  onEdit: () => void;
  /** Opens the full-screen 3D poster inspector with the ACTIVE poster image (the one tapped). */
  onInspectPoster?: (uri: string, journey: UserMovie) => void;
  /** True only when a ticket scan backs this journey — gates the emerald "Verified" badge. */
  verified?: boolean;
  /** Fixed card height — identical for every card in the pager (layout constant). */
  height: number;
  /**
   * Fixed stub-slab height (layout constant from the screen — same for every
   * card) so the perforation seam sits at the same Y regardless of data/state.
   */
  stubHeight: number;
  /**
   * Segmented Original|AI pill tap. The screen decides: swap the cover when AI
   * art exists, open the generate sheet when it doesn't.
   */
  onSelectVariant: (variant: 'original' | 'ai') => void;
}

export function JourneyCard({
  journey,
  firstTake,
  companions,
  showAi,
  flipped,
  onFlip,
  page,
  setPage,
  onEdit,
  onInspectPoster,
  verified,
  height,
  stubHeight,
  onSelectVariant,
}: JourneyCardProps) {
  const c = useScanColors();
  const rating = firstTake?.rating ?? null;
  const note = firstTake?.quote_text?.trim() || null;
  const hasTake = rating != null || !!note;

  const posterUri = useMemo(() => {
    if (showAi && journey.ai_poster_url) return journey.ai_poster_url;
    return getTMDBImageUrl(journey.poster_path ?? null, 'w780');
  }, [showAi, journey.ai_poster_url, journey.poster_path]);

  // Front stub = at most 3 priority fields (Date · Cinema/Service/Airline-or-
  // Format · With) in ONE row — empty fields are omitted (never "N/A"), long
  // values ellipsize (never wrap to new rows); the secondary details
  // (Cinema · Seat · Paid) stay on the back.
  const fields: StubFieldData[] = useMemo(() => {
    const list: StubFieldData[] = [];
    const date = formatDate(journey.watched_at);
    if (date) list.push({ label: 'Date', value: date });
    const place = buildPlaceField(journey);
    if (place) list.push(place);
    list.push(
      companions.length
        ? {
            label: 'With',
            node: <AvatarStack people={companions} max={3} size={s(28)} ringColor={c.card} />,
          }
        : { label: 'With', value: 'Solo' },
    );
    return list;
  }, [journey, companions, c.card]);

  // Secondary details shown on the BACK of the ticket (moved off the front).
  const backDetails = useMemo(() => {
    const seat = buildSeat(journey);
    return [
      { label: 'Cinema', value: journey.location_name?.trim() || journey.theater_chain?.trim() || null },
      seat ? { label: seat.label, value: seat.value } : null,
      { label: 'Paid', value: formatPrice(journey.ticket_price) },
    ].filter((d): d is { label: string; value: string } => !!d && !!d.value);
  }, [journey]);

  const ticketId = journey.ticket_id || `CNTK-${journey.id.slice(0, 8).toUpperCase()}`;
  const stubBg = c.card; // themed: AI premium is marked by the rose border + poster, not a dark stub (which broke light mode)

  const front = (
    <View style={{ flex: 1 }}>
      {/* Poster — fills the fixed region above the seam (height - stubHeight,
          both layout constants, so the seam Y never moves between cards) */}
      <View
        style={{
          flex: 1,
          borderTopLeftRadius: s(22),
          borderTopRightRadius: s(22),
          overflow: 'hidden',
          backgroundColor: c.card,
          borderWidth: showAi ? 1 : 0,
          borderColor: showAi ? ScanV2Accent.soft : 'transparent',
        }}
      >
        {posterUri ? (
          <Pressable
            onPress={() => onInspectPoster?.(posterUri, journey)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <SignedPhoto
              expoImage
              uri={posterUri}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ) : null}

        <GlassButton side="left" onPress={onFlip}>
          <FlipGlyph size={s(17)} color="#fff" />
        </GlassButton>
        <GlassButton side="right" onPress={onEdit}>
          <Icon name="pencil" size={s(17)} color="#fff" />
        </GlassButton>

        {/* Original | ✦ AI segmented pill — the art control lives ON the card */}
        <ArtSegmentedPill showAi={showAi} onSelect={onSelectVariant} />

        {/* Watch-context tag — label driven by location_type */}
        <View
          style={{
            position: 'absolute',
            right: s(14),
            bottom: s(14),
            paddingVertical: s(6),
            paddingHorizontal: s(11),
            borderRadius: s(8),
            backgroundColor: ScanV2Accent.primary,
          }}
        >
          <ScanText
            style={{
              fontFamily: Fonts.mono.bold,
              fontSize: s(11),
              letterSpacing: 0.6,
              color: ScanV2Accent.on,
            }}
          >
            {getWatchContextLabel(journey.location_type)}
          </ScanText>
        </View>
      </View>

      <PerforationSeam />

      {/* Stub — FIXED-height minimal slab; content truncates/omits, never grows */}
      <View
        style={{
          height: stubHeight,
          backgroundColor: stubBg,
          borderBottomLeftRadius: s(22),
          borderBottomRightRadius: s(22),
          borderWidth: 1,
          borderTopWidth: 0,
          borderColor: c.line,
          paddingTop: s(12),
          paddingHorizontal: s(18),
          paddingBottom: s(8),
          overflow: 'hidden',
        }}
      >
        {/* Header: one-line title + rating chip (only when rating exists) */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s(10) }}>
          <ScanText
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: Fonts.outfit.extrabold,
              fontSize: s(22),
              letterSpacing: -0.4,
              lineHeight: s(26),
              color: c.text,
            }}
          >
            {journey.title}
          </ScanText>
          {rating != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', transform: [{ skewX: '-8deg' }] }}>
              <ScanText
                style={{
                  fontFamily: Fonts.outfit.extrabold,
                  fontSize: s(22),
                  letterSpacing: -0.4,
                  lineHeight: s(26),
                  color: ScanV2Accent.primary,
                }}
              >
                {rating.toFixed(1)}
              </ScanText>
              <ScanText
                style={{
                  fontFamily: Fonts.outfit.bold,
                  fontSize: s(15),
                  color: ScanV2Accent.primary,
                  opacity: 0.55,
                }}
              >
                {' '}/ 10
              </ScanText>
            </View>
          ) : null}
        </View>

        {/* Carousel pages — clipped to the space between title and the dots row */}
        <View style={{ flex: 1, marginTop: s(8), overflow: 'hidden' }}>
          {page === 0 ? (
            <View style={{ flexDirection: 'row', gap: s(12) }}>
              {fields.map((f, i) => (
                <StubField key={`${f.label}-${i}`} label={f.label} value={f.value} node={f.node} />
              ))}
            </View>
          ) : (
            <View>
              <ScanText
                style={{
                  fontFamily: Fonts.mono.medium,
                  fontSize: s(10),
                  lineHeight: s(13),
                  letterSpacing: 1.3,
                  color: c.ter,
                  textTransform: 'uppercase',
                  marginBottom: s(4),
                }}
              >
                Your First Take
              </ScanText>
              {note ? (
                <ScanText
                  numberOfLines={2}
                  style={{ fontFamily: Fonts.inter.regular, fontSize: s(14.5), color: c.text, lineHeight: s(20) }}
                >
                  {note}
                </ScanText>
              ) : rating != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), marginTop: s(8) }}>
                  <View style={{ flex: 1, height: s(6), borderRadius: 999, backgroundColor: c.field, overflow: 'hidden' }}>
                    <View style={{ width: `${rating * 10}%`, height: '100%', borderRadius: 999, backgroundColor: ScanV2Accent.primary }} />
                  </View>
                  <ScanText style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(14), color: ScanV2Accent.primary }}>
                    {rating}/10
                  </ScanText>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Page dots / chevrons row — height always reserved so the stub never
            resizes; controls render only when a take exists */}
        <View style={{ height: s(34), justifyContent: 'center' }}>
          {hasTake ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(14) }}>
              <Pressable
                onPress={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                style={{
                  width: s(30),
                  height: s(30),
                  borderRadius: 999,
                  backgroundColor: c.field,
                  borderWidth: 1,
                  borderColor: c.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: page === 0 ? 0.4 : 1,
                }}
              >
                <Icon name="chevL" size={s(15)} color={c.sec} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: s(6) }}>
                {[0, 1].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: page === i ? s(18) : s(6),
                      height: s(6),
                      borderRadius: 999,
                      backgroundColor: page === i ? ScanV2Accent.primary : c.lineHi,
                    }}
                  />
                ))}
              </View>
              <Pressable
                onPress={() => setPage(Math.min(1, page + 1))}
                disabled={page === 1}
                style={{
                  width: s(30),
                  height: s(30),
                  borderRadius: 999,
                  backgroundColor: c.field,
                  borderWidth: 1,
                  borderColor: c.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: page === 1 ? 0.4 : 1,
                }}
              >
                <Icon name="chevR" size={s(15)} color={c.sec} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  const back = (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          borderRadius: s(22),
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.card,
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(18),
          paddingVertical: s(34),
          paddingHorizontal: s(24),
        }}
      >
        <Pressable
          onPress={onFlip}
          style={{
            position: 'absolute',
            top: s(12),
            left: s(12),
            width: s(36),
            height: s(36),
            borderRadius: 999,
            backgroundColor: c.field,
            borderWidth: 1,
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FlipGlyph size={s(17)} color={c.sec} />
        </Pressable>

        {/* Status pill — emerald "Verified" only when a ticket scan backs the visit;
            otherwise a neutral "Theater visit" (manually-logged journeys aren't scanned). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(6),
            paddingVertical: s(6),
            paddingHorizontal: s(12),
            borderRadius: 999,
            backgroundColor: verified ? 'rgba(16,185,129,0.14)' : c.field,
          }}
        >
          {verified ? <Icon name="check" size={s(14)} color={c.emerald} stroke={2.6} /> : null}
          <ScanText style={{ fontFamily: Fonts.inter.bold, fontSize: s(12), color: verified ? c.emerald : c.sec }}>
            {verified ? 'Verified theater visit' : 'Theater visit'}
          </ScanText>
        </View>

        {/* Decorative barcode */}
        <View style={{ width: '78%' }}>
          <Barcode height={s(82)} color={c.text} />
        </View>

        {/* Real confirmation code */}
        <ScanText
          style={{
            fontFamily: Fonts.mono.medium,
            fontSize: s(12),
            letterSpacing: 3,
            color: c.sec,
          }}
        >
          {ticketId}
        </ScanText>

        {/* Secondary details (Cinema · Seat · Paid) — moved off the front */}
        {backDetails.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', alignSelf: 'stretch', gap: s(8) }}>
            {backDetails.map((d) => (
              <View key={d.label} style={{ flex: 1, alignItems: 'center', paddingHorizontal: s(4) }}>
                <ScanText style={{ fontFamily: Fonts.mono.medium, fontSize: s(9.5), letterSpacing: 1, color: c.ter, textTransform: 'uppercase' }}>
                  {d.label}
                </ScanText>
                <ScanText
                  numberOfLines={2}
                  style={{ fontFamily: Fonts.inter.semibold, fontSize: s(13), color: c.text, marginTop: s(4), textAlign: 'center', lineHeight: s(16) }}
                >
                  {d.value}
                </ScanText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Footer */}
        <View style={{ alignItems: 'center', gap: s(3) }}>
          <ScanText style={{ fontFamily: Fonts.outfit.bold, fontSize: s(16), color: c.text }}>
            {journey.title}
          </ScanText>
          <ScanText
            style={{
              fontFamily: Fonts.mono.regular,
              fontSize: s(11),
              letterSpacing: 1,
              color: c.ter,
            }}
          >
            {formatDate(journey.watched_at)?.toUpperCase()}
          </ScanText>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ height, flexDirection: 'column', overflow: 'hidden' }}>
      <FadeIn key={flipped ? 'back' : 'front'}>{flipped ? back : front}</FadeIn>
    </View>
  );
}

export default JourneyCard;
