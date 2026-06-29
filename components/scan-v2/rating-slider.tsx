/**
 * Ticket Scan v2 — `RatingSlider`.
 *
 * Native recreation of the prototype's `RatingSlider` + the rate-step value
 * block (`scan-art.jsx` `RatingSlider`/`ratingToPct`/`pctToRating`,
 * `scan-screens2.jsx` `FirstTakeModal` step 0). A custom piecewise drag control —
 * the community `Slider` can't put 1 / 5 / 10 at 0% / 50% / 100% — so 5.0 is the
 * dead-center anchor and the range below/above it each own half the track.
 *
 * Renders the full rate block: the big value (rose, or `—` until first drag), a
 * word band (Poor … Masterpiece), the track + thumb, and the
 * POOR · AVERAGE · MASTERPIECE mono row.
 *
 * Drag + tap-anywhere via `PanResponder` (no native module → OTA-able). Each
 * 0.1 change fires `hapticSelection()`. Exposed as an a11y "adjustable" with
 * increment / decrement (custom controls need an accessible step). Dark-only
 * (`ScanV2Colors`/`ScanV2Accent`); sizes via `s()`, text via `ScanText`.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, PanResponder, type GestureResponderEvent } from 'react-native';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';
import { hapticSelection } from '@/lib/haptics';
import { ScanText } from './primitives';

// Piecewise mapping so 1.0 / 5.0 / 10.0 sit at 0% / 50% / 100%.
export function ratingToPct(v: number): number {
  return v <= 5 ? ((v - 1) / 4) * 50 : 50 + ((v - 5) / 5) * 50;
}

export function pctToRating(p: number): number {
  const clampedPct = Math.max(0, Math.min(100, p));
  let v = clampedPct <= 50 ? 1 + (clampedPct / 50) * 4 : 5 + ((clampedPct - 50) / 50) * 5;
  v = Math.round(v * 10) / 10;
  return Math.max(1, Math.min(10, v));
}

// Word band for the current score (matches the prototype's `word`).
function ratingWord(rating: number | null): string {
  if (rating == null) return 'Not rated yet';
  if (rating < 4) return 'Poor';
  if (rating < 5) return 'Below average';
  if (rating <= 5) return 'Average';
  if (rating <= 7) return 'Good';
  if (rating <= 9) return 'Great';
  return 'Masterpiece';
}

interface RatingSliderProps {
  /** Current rating (1.0–10.0), or `null` before the user has scored it. */
  value: number | null;
  onChange: (value: number) => void;
}

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  const widthRef = useRef(0);
  const lastSnapRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Where the thumb sits even before the user commits a rating (visual center).
  const thumbValue = value ?? 5;
  const pct = ratingToPct(thumbValue);

  const handleAt = useCallback((locationX: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const next = pctToRating((locationX / w) * 100);
    if (next !== lastSnapRef.current) {
      lastSnapRef.current = next;
      hapticSelection();
      onChangeRef.current(next);
    }
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          lastSnapRef.current = null;
          handleAt(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e: GestureResponderEvent) => handleAt(e.nativeEvent.locationX),
      }),
    [handleAt]
  );

  const step = useCallback(
    (delta: number) => {
      const next = Math.max(1, Math.min(10, Math.round((thumbValue + delta) * 10) / 10));
      hapticSelection();
      onChangeRef.current(next);
    },
    [thumbValue]
  );

  const thumb = s(26);

  return (
    <View>
      {/* big value */}
      <View style={{ alignItems: 'center', marginTop: s(8), marginBottom: s(8) }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {value == null ? (
            <ScanText
              style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(50), lineHeight: s(54), color: ScanV2Colors.lineHi }}
            >
              —
            </ScanText>
          ) : (
            <>
              <ScanText
                style={{ fontFamily: Fonts.outfit.extrabold, fontSize: s(50), lineHeight: s(54), color: ScanV2Accent.primary }}
              >
                {value.toFixed(1)}
              </ScanText>
              <ScanText
                style={{ fontFamily: Fonts.outfit.bold, fontSize: s(20), lineHeight: s(24), color: ScanV2Colors.ter }}
              >
                {' / 10'}
              </ScanText>
            </>
          )}
        </View>
        <ScanText
          style={{
            fontFamily: Fonts.inter.semibold,
            fontSize: s(13),
            lineHeight: s(16),
            color: value == null ? ScanV2Colors.ter : ScanV2Colors.sec,
            marginTop: s(4),
          }}
        >
          {ratingWord(value)}
        </ScanText>
      </View>

      {/* track + thumb (tap-anywhere + drag) */}
      <View
        {...pan.panHandlers}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Rating"
        accessibilityValue={{ min: 1, max: 10, now: thumbValue }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') step(0.1);
          else if (event.nativeEvent.actionName === 'decrement') step(-0.1);
        }}
        style={{ height: s(40), justifyContent: 'center' }}
      >
        {/* base track */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: s(8),
            borderRadius: 999,
            backgroundColor: ScanV2Colors.field,
            borderWidth: 1,
            borderColor: ScanV2Colors.fieldLine,
          }}
        />
        {/* fill */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: `${pct}%`,
            height: s(8),
            borderRadius: 999,
            backgroundColor: ScanV2Accent.primary,
          }}
        />
        {/* center anchor tick at 5.0 */}
        <View
          style={{
            position: 'absolute',
            left: '50%',
            width: s(2),
            height: s(15),
            marginLeft: -s(1),
            borderRadius: s(2),
            backgroundColor: ScanV2Colors.lineHi,
          }}
        />
        {/* thumb */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${pct}%`,
            width: thumb,
            height: thumb,
            marginLeft: -thumb / 2,
            borderRadius: 999,
            backgroundColor: '#ffffff',
            borderWidth: s(4),
            borderColor: ScanV2Accent.soft,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.45,
            shadowRadius: 8,
            elevation: 4,
          }}
        />
      </View>

      {/* POOR · AVERAGE · MASTERPIECE */}
      <View style={{ flexDirection: 'row', marginTop: s(2) }}>
        <ScanText style={labelStyle('left')}>POOR</ScanText>
        <ScanText style={labelStyle('center')}>AVERAGE</ScanText>
        <ScanText style={labelStyle('right')}>MASTERPIECE</ScanText>
      </View>
    </View>
  );
}

function labelStyle(align: 'left' | 'center' | 'right') {
  return {
    flex: 1,
    textAlign: align,
    fontFamily: Fonts.mono.medium,
    fontSize: s(10),
    lineHeight: s(13),
    letterSpacing: 0.5,
    color: ScanV2Colors.ter,
  } as const;
}
