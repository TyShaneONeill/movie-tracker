/**
 * Ticket Scan v2 — shared visual primitives.
 *
 * Native recreation of `scan-art.jsx` / the shared chrome in `scan-screens.jsx`.
 * Everything here is DARK-ONLY (built from `ScanV2Colors`/`ScanV2Accent`, never
 * the theme-aware `Colors`), and every numeric size runs through `s()`. Text is
 * rendered via `ScanText`, which disables RN font scaling so `s()` is the sole
 * scaling source (no double-scale).
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
  type TextProps,
  type ViewStyle,
  type StyleProp,
  type DimensionValue,
} from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

import { Fonts } from '@/constants/theme';
import { ScanV2Colors, ScanV2Accent } from '@/constants/scan-v2-theme';
import { s } from '@/lib/scan-v2/scale';

// ============================================================================
// ScanText — font-scale-locked Text
// ============================================================================

/**
 * v2 Text wrapper. Defaults `allowFontScaling={false}` so the `s()` util is the
 * SOLE source of font scaling for the scan flow.
 */
export function ScanText({ allowFontScaling = false, ...props }: TextProps) {
  return <Text allowFontScaling={allowFontScaling} {...props} />;
}

// ============================================================================
// Icon — ported SVG path data from scan-art.jsx
// ============================================================================

export type ScanIconName =
  | 'camera'
  | 'flash'
  | 'bolt'
  | 'image'
  | 'x'
  | 'check'
  | 'chevR'
  | 'pencil'
  | 'search'
  | 'clock'
  | 'seat'
  | 'film'
  | 'warn'
  | 'info'
  | 'trash'
  | 'arrowL'
  | 'arrowR'
  | 'gear'
  | 'ticket'
  | 'plus';

interface IconProps {
  name: ScanIconName;
  size?: number;
  color?: string;
  stroke?: number;
}

export function Icon({ name, size = 20, color = ScanV2Colors.text, stroke = 2 }: IconProps) {
  const p = {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  let body: React.ReactNode = null;
  switch (name) {
    case 'camera':
      body = (
        <>
          <Path {...p} d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Circle {...p} cx={12} cy={12.5} r={3.5} />
        </>
      );
      break;
    case 'flash':
    case 'bolt':
      body = <Path {...p} d="M13 3 5 13h5l-1 8 8-10h-5z" />;
      break;
    case 'image':
      body = (
        <>
          <Rect {...p} x={3} y={4} width={18} height={16} rx={2.5} />
          <Circle {...p} cx={8.5} cy={9.5} r={1.6} />
          <Path {...p} d="m4 17 5-4 4 3 3-2 4 3" />
        </>
      );
      break;
    case 'x':
      body = <Path {...p} d="M6 6l12 12M18 6 6 18" />;
      break;
    case 'check':
      body = <Path {...p} d="M5 12.5 10 17.5 19.5 7" />;
      break;
    case 'chevR':
      body = <Path {...p} d="M10 6l6 6-6 6" />;
      break;
    case 'pencil':
      body = (
        <>
          <Path {...p} d="M4 20h4L18.5 9.5a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 16z" />
          <Path {...p} d="M13.5 7.5 17 11" />
        </>
      );
      break;
    case 'search':
      body = (
        <>
          <Circle {...p} cx={11} cy={11} r={6.5} />
          <Path {...p} d="m20 20-3.6-3.6" />
        </>
      );
      break;
    case 'clock':
      body = (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Path {...p} d="M12 7.5V12l3 2" />
        </>
      );
      break;
    case 'seat':
      body = (
        <Path
          {...p}
          d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4m1 0a2 2 0 0 0-2 2v3H6v-3a2 2 0 0 0-2-2 1.5 1.5 0 0 0-1.5 1.5V18a1 1 0 0 0 1 1H4M20 19h.5a1 1 0 0 0 1-1v-3.5A1.5 1.5 0 0 0 20 13M7 19v2M17 19v2"
        />
      );
      break;
    case 'film':
      body = (
        <>
          <Rect {...p} x={3} y={4} width={18} height={16} rx={2.5} />
          <Path {...p} d="M8 4v16M16 4v16M3 9h5m8 0h5M3 15h5m8 0h5" />
        </>
      );
      break;
    case 'warn':
      body = (
        <>
          <Path {...p} d="M12 4.5 21 19H3z" />
          <Path {...p} d="M12 10v4M12 17h.01" />
        </>
      );
      break;
    case 'info':
      body = (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Path {...p} d="M12 11v5M12 8h.01" />
        </>
      );
      break;
    case 'trash':
      body = <Path {...p} d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />;
      break;
    case 'arrowL':
      body = <Path {...p} d="M19 12H5m6-6-6 6 6 6" />;
      break;
    case 'arrowR':
      body = <Path {...p} d="M5 12h14m-6-6 6 6-6 6" />;
      break;
    case 'plus':
      body = <Path {...p} d="M12 5v14M5 12h14" />;
      break;
    case 'gear':
      body = (
        <>
          <Circle {...p} cx={12} cy={12} r={3.2} />
          <Path
            {...p}
            d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.7-1.3-1.7-3-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.2 3H9.8l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-2-.8-1.7 3 1.7 1.3a7.7 7.7 0 0 0 0 3l-1.7 1.3 1.7 3 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h4.4l.3-2a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.7-3z"
          />
        </>
      );
      break;
    case 'ticket':
      body = (
        <>
          <Path {...p} d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z" />
          <Path {...p} strokeDasharray="2,2" d="M14 6v12" />
        </>
      );
      break;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

// ============================================================================
// Chip — only render when there's a value (callers guard)
// ============================================================================

interface ChipProps {
  icon?: ScanIconName;
  label: string;
}

export function Chip({ icon, label }: ChipProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(5),
        paddingVertical: s(5),
        paddingHorizontal: s(9),
        borderRadius: 999,
        backgroundColor: ScanV2Colors.field,
        borderWidth: 1,
        borderColor: ScanV2Colors.fieldLine,
      }}
    >
      {icon ? <Icon name={icon} size={s(13)} color={ScanV2Colors.sec} stroke={2} /> : null}
      <ScanText
        style={{
          fontFamily: Fonts.inter.medium,
          fontSize: s(12),
          lineHeight: s(13.2),
          color: ScanV2Colors.sec,
        }}
      >
        {label}
      </ScanText>
    </View>
  );
}

// ============================================================================
// PillButton
// ============================================================================

export type PillKind = 'primary' | 'soft' | 'ghost' | 'quiet';

interface PillButtonProps {
  label: string;
  onPress?: () => void;
  kind?: PillKind;
  icon?: ScanIconName;
  iconRight?: ScanIconName;
  full?: boolean;
  disabled?: boolean;
  /** Keep the icon + label on a single line (for tight side-by-side buttons). */
  nowrap?: boolean;
  style?: StyleProp<ViewStyle>;
}

function pillColors(kind: PillKind): { bg: string; fg: string; border: string } {
  switch (kind) {
    case 'primary':
      return { bg: ScanV2Accent.primary, fg: ScanV2Accent.on, border: 'transparent' };
    case 'soft':
      return { bg: ScanV2Accent.soft, fg: ScanV2Accent.primary, border: 'transparent' };
    case 'ghost':
      return { bg: ScanV2Colors.field, fg: ScanV2Colors.text, border: ScanV2Colors.line };
    case 'quiet':
      return { bg: 'transparent', fg: ScanV2Colors.sec, border: 'transparent' };
  }
}

export function PillButton({
  label,
  onPress,
  kind = 'primary',
  icon,
  iconRight,
  full,
  disabled,
  nowrap,
  style,
}: PillButtonProps) {
  const c = pillColors(kind);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: nowrap ? 'nowrap' : 'wrap',
          gap: s(8),
          minHeight: s(34),
          paddingVertical: s(9),
          paddingHorizontal: s(16),
          borderRadius: 999,
          backgroundColor: c.bg,
          borderWidth: c.border === 'transparent' ? 0 : 1,
          borderColor: c.border,
          width: full ? '100%' : undefined,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={s(17)} color={c.fg} /> : null}
      <ScanText
        numberOfLines={nowrap ? 1 : undefined}
        style={{
          fontFamily: Fonts.inter.semibold,
          fontSize: s(15),
          lineHeight: s(17.25),
          color: c.fg,
          textAlign: 'center',
          flexShrink: nowrap ? 1 : 0,
        }}
      >
        {label}
      </ScanText>
      {iconRight ? <Icon name={iconRight} size={s(17)} color={c.fg} /> : null}
    </Pressable>
  );
}

// ============================================================================
// ScansPill
// ============================================================================

export function ScansPill({ left }: { left: number }) {
  const none = left <= 0;
  const color = none ? ScanV2Accent.primary : ScanV2Colors.sec;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(6),
        paddingVertical: s(7),
        paddingHorizontal: s(11),
        borderRadius: 999,
        backgroundColor: none ? 'rgba(225,29,72,0.12)' : ScanV2Colors.field,
        borderWidth: 1,
        borderColor: none ? 'rgba(225,29,72,0.35)' : ScanV2Colors.line,
      }}
    >
      <Icon name="bolt" size={s(13)} color={color} />
      <ScanText
        style={{
          fontFamily: Fonts.mono.medium,
          fontSize: s(11),
          lineHeight: s(13),
          letterSpacing: 0.3,
          color,
        }}
      >
        {none ? '0 LEFT' : `${left} SCAN${left === 1 ? '' : 'S'} LEFT`}
      </ScanText>
    </View>
  );
}

// ============================================================================
// TopBar
// ============================================================================

interface TopBarProps {
  title?: string;
  sub?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}

export function TopBar({ title, sub, right, onBack, transparent }: TopBarProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        paddingTop: s(54),
        paddingBottom: s(10),
        paddingHorizontal: s(16),
        backgroundColor: transparent ? 'transparent' : ScanV2Colors.bg,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={{
            width: s(38),
            height: s(38),
            borderRadius: 999,
            backgroundColor: transparent ? 'rgba(0,0,0,0.4)' : ScanV2Colors.field,
            borderWidth: 1,
            borderColor: ScanV2Colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrowL" size={s(19)} color={ScanV2Colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <ScanText
            style={{
              fontFamily: Fonts.outfit.extrabold,
              fontSize: s(24),
              lineHeight: s(26.4),
              letterSpacing: -0.4,
              color: ScanV2Colors.text,
            }}
          >
            {title}
          </ScanText>
        ) : null}
        {sub ? (
          <ScanText
            style={{
              fontFamily: Fonts.inter.regular,
              fontSize: s(13),
              lineHeight: s(16),
              color: ScanV2Colors.sec,
              marginTop: s(2),
            }}
          >
            {sub}
          </ScanText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ============================================================================
// ScanFrame — bracket corners + animated sweep + dim mask cutout
// ============================================================================

export interface FrameInset {
  top: number; // percent
  right: number;
  bottom: number;
  left: number;
}

interface ScanFrameProps {
  sweep?: boolean;
  inset?: FrameInset;
}

const DIM = 'rgba(0,0,0,0.45)';

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const sz = s(30);
  const b = s(3);
  const radius = s(10);
  const base: ViewStyle = { position: 'absolute', width: sz, height: sz };
  const map: Record<string, ViewStyle> = {
    tl: { top: 0, left: 0, borderTopWidth: b, borderLeftWidth: b, borderTopLeftRadius: radius },
    tr: { top: 0, right: 0, borderTopWidth: b, borderRightWidth: b, borderTopRightRadius: radius },
    bl: { bottom: 0, left: 0, borderBottomWidth: b, borderLeftWidth: b, borderBottomLeftRadius: radius },
    br: { bottom: 0, right: 0, borderBottomWidth: b, borderRightWidth: b, borderBottomRightRadius: radius },
  };
  return <View style={[base, map[pos], { borderColor: ScanV2Accent.primary }]} />;
}

// Builds an even-odd fill path: a full-screen rectangle with a rounded-corner
// rectangular hole punched out. The hole's corner radius matches the bracket
// radius so the dim surround lines up with the rounded brackets (no square
// corners). The inside of the hole stays fully clear (camera unobscured).
function cutoutPath(W: number, H: number, x: number, y: number, w: number, h: number, r: number): string {
  const outer = `M0 0 H${W} V${H} H0 Z`;
  const right = x + w;
  const bottom = y + h;
  const hole =
    `M${x + r} ${y}` +
    `H${right - r}` +
    `A${r} ${r} 0 0 1 ${right} ${y + r}` +
    `V${bottom - r}` +
    `A${r} ${r} 0 0 1 ${right - r} ${bottom}` +
    `H${x + r}` +
    `A${r} ${r} 0 0 1 ${x} ${bottom - r}` +
    `V${y + r}` +
    `A${r} ${r} 0 0 1 ${x + r} ${y}` +
    `Z`;
  return `${outer} ${hole}`;
}

export function ScanFrame({ sweep = true, inset = { top: 13, right: 9, bottom: 16, left: 9 } }: ScanFrameProps) {
  const sweepAnim = React.useRef(new Animated.Value(0)).current;
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useEffect(() => {
    if (!sweep) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sweepAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, sweepAnim]);

  const pct = (n: number): DimensionValue => `${n}%`;

  const frameStyle: ViewStyle = {
    position: 'absolute',
    top: pct(inset.top),
    bottom: pct(inset.bottom),
    left: pct(inset.left),
    right: pct(inset.right),
    borderRadius: s(12),
  };

  // Geometry of the clear cutout, derived from the measured container so it
  // exactly tracks the same box the percentage insets describe — and recomputes
  // when the inset shrinks from the bottom (EMPTY_INSET -> TRAY_INSET as the
  // capture tray appears). `holeH` is the live inner-frame height the sweep
  // travels, so the line spans the full frame at every inset.
  const { w: W, h: H } = size;
  const holeX = (inset.left / 100) * W;
  const holeY = (inset.top / 100) * H;
  const holeW = W - ((inset.left + inset.right) / 100) * W;
  const holeH = H - ((inset.top + inset.bottom) / 100) * H;
  const r = Math.max(0, Math.min(s(10), holeW / 2, holeH / 2));
  const ready = W > 0 && H > 0 && holeW > 0 && holeH > 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
      }}
    >
      {/* dim surround with a rounded-corner cutout aligned to the brackets */}
      {ready ? (
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={cutoutPath(W, H, holeX, holeY, holeW, holeH, r)} fill={DIM} fillRule="evenodd" />
        </Svg>
      ) : null}

      {/* frame + corners + sweep */}
      <View style={frameStyle}>
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        {sweep ? (
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: s(12) }]}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                backgroundColor: ScanV2Accent.primary,
                shadowColor: ScanV2Accent.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 8,
                transform: [
                  {
                    translateY: sweepAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, holeH],
                    }),
                  },
                ],
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
