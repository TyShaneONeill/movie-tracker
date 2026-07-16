/**
 * The app's canonical 1–10 rating input, extracted from review-modal so the
 * review flow and the TV Time deck share ONE slider (no fork). A big value read
 * ("8" / "7.5" — whole numbers drop the decimal) over a 0–10 slider, with
 * Poor / Average / Masterpiece anchors.
 *
 * `unset` (deck use) shows "—" and a muted thumb until the user touches the
 * slider — the deck ASKS, it never shows a pre-filled score. review-modal passes
 * a concrete value and never sets `unset`.
 */

import { View, Text, StyleSheet, Platform, type ViewStyle } from 'react-native';
import Slider from '@react-native-community/slider';
import { Colors, Spacing, Fonts } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';

/** Display: drop the decimal on whole numbers ("8"), keep it otherwise ("7.5"). */
export function formatRating(value: number): string {
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}

interface RatingSliderProps {
  value: number;
  onChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  disabled?: boolean;
  /** Deck: render "—" and a muted thumb until first touch. */
  unset?: boolean;
  /** Shrink the value read for tight surfaces (the deck card). */
  valueFontSize?: number;
  style?: ViewStyle;
}

export function RatingSlider({
  value,
  onChange,
  onSlidingComplete,
  disabled = false,
  unset = false,
  valueFontSize = 48,
  style,
}: RatingSliderProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const styles = createStyles(colors);

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.display}>
        <Text
          style={[
            styles.value,
            { fontSize: valueFontSize, lineHeight: valueFontSize + 4, color: unset ? colors.textTertiary : colors.tint },
          ]}
        >
          {unset ? '—' : formatRating(value)}
        </Text>
        <Text style={styles.max}>/ 10</Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={10}
          step={0.1}
          value={value}
          disabled={disabled}
          onValueChange={(v) => onChange(Math.round(v * 10) / 10)}
          onSlidingComplete={onSlidingComplete ? (v) => onSlidingComplete(Math.round(v * 10) / 10) : undefined}
          minimumTrackTintColor={unset ? colors.textTertiary : colors.tint}
          maximumTrackTintColor={colors.backgroundSecondary}
          thumbTintColor={unset ? colors.textTertiary : '#ffffff'}
        />
      </View>

      <View style={styles.labels}>
        <Text style={[styles.labelText, styles.labelLeft]}>Poor</Text>
        <Text style={[styles.labelText, styles.labelCenter]}>Average</Text>
        <Text style={[styles.labelText, styles.labelRight]}>Masterpiece</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    wrapper: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, width: '100%' },
    display: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    value: { fontFamily: Fonts.outfit.extrabold },
    max: { fontFamily: Fonts.outfit.semibold, fontSize: 20, color: colors.textTertiary },
    sliderContainer: { width: '100%', height: 32, justifyContent: 'center' },
    slider: { width: '100%', height: 32 },
    labels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: -Spacing.xs,
      paddingHorizontal: Platform.OS === 'ios' ? 16 : 0,
    },
    labelText: {
      ...Typography.body.xs,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: Fonts.inter.semibold,
      flex: 1,
    },
    labelLeft: { textAlign: 'left' },
    labelCenter: { textAlign: 'center' },
    labelRight: { textAlign: 'right' },
  });
