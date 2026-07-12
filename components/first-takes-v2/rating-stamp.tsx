/**
 * RatingStamp — the admission-mark rating for First Takes v2 (contract note C).
 *
 * An SVG double ring rotated −6° with a tabular number, like an ink stamp on a
 * ticket. `accent` (rose) is used on the latest take ONLY; older takes use the
 * quiet neutral variant. Green/yellow rating colors are intentionally dropped on
 * this tab per Ty.
 *
 * Renders nothing when there is no positive rating — the rating slot stays EMPTY
 * (Decision, Ty 2026-07-11); `reaction_emoji` is never a rating substitute.
 */

import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { formatRating } from '@/lib/first-takes-v2-logic';

interface RatingStampProps {
  rating: number;
  /** Rose ink + inner ring (latest take). Otherwise neutral, single ring. */
  accent?: boolean;
  /** Diameter in px. Hero uses 52; ledger rows 40. */
  size?: number;
}

export function RatingStamp({ rating, accent = false, size = 40 }: RatingStampProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const label = formatRating(rating);
  const ink = accent ? colors.tint : colors.textSecondary;
  // Long labels (e.g. "8.5", "10") need a smaller glyph to fit the ring.
  const fontSize = label.length >= 3 ? 13 : 17;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      style={{ transform: [{ rotate: '-6deg' }] }}
      accessibilityRole="image"
      accessibilityLabel={`Rated ${label}`}
    >
      <Circle cx={26} cy={26} r={24} stroke={ink} strokeWidth={1.5} fill="none" />
      {accent && (
        <Circle cx={26} cy={26} r={19.5} stroke={ink} strokeWidth={1} fill="none" />
      )}
      <SvgText
        x={26}
        y={26 + fontSize / 2 - 1}
        textAnchor="middle"
        fill={ink}
        fontSize={fontSize}
        fontWeight="700"
      >
        {label}
      </SvgText>
    </Svg>
  );
}
