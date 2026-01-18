/**
 * CineTrack Typography System
 * Font presets and text styles matching ui-mocks/styles.css
 */

import { TextStyle } from 'react-native';
import { Fonts, FontSizes, FontWeights } from './theme';

/**
 * Base text style presets
 * Use these as building blocks for component text styles
 */
export const Typography = {
  // Display styles (using Outfit font for headings)
  display: {
    h1: {
      fontFamily: Fonts.display,
      fontSize: FontSizes['4xl'], // 36px
      fontWeight: FontWeights.bold,
      lineHeight: 40,
    } as TextStyle,

    h2: {
      fontFamily: Fonts.display,
      fontSize: FontSizes['3xl'], // 30px
      fontWeight: FontWeights.bold,
      lineHeight: 36,
    } as TextStyle,

    h3: {
      fontFamily: Fonts.display,
      fontSize: FontSizes['2xl'], // 24px
      fontWeight: FontWeights.bold,
      lineHeight: 28,
    } as TextStyle,

    h4: {
      fontFamily: Fonts.display,
      fontSize: FontSizes.xl, // 20px
      fontWeight: FontWeights.bold,
      lineHeight: 24,
    } as TextStyle,
  },

  // Body text styles (using Inter font)
  body: {
    xlBold: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xl, // 20px
      fontWeight: FontWeights.bold,
      lineHeight: 28,
    } as TextStyle,

    lg: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.lg, // 18px
      fontWeight: FontWeights.semibold,
      lineHeight: 26,
    } as TextStyle,

    lgRegular: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.lg, // 18px
      fontWeight: FontWeights.normal,
      lineHeight: 26,
    } as TextStyle,

    base: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.base, // 16px
      fontWeight: FontWeights.normal,
      lineHeight: 24,
    } as TextStyle,

    baseMedium: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.base, // 16px
      fontWeight: FontWeights.medium,
      lineHeight: 24,
    } as TextStyle,

    sm: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.sm, // 14px
      fontWeight: FontWeights.normal,
      lineHeight: 20,
    } as TextStyle,

    smMedium: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.sm, // 14px
      fontWeight: FontWeights.medium,
      lineHeight: 20,
    } as TextStyle,

    xs: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xs, // 12px
      fontWeight: FontWeights.normal,
      lineHeight: 16,
    } as TextStyle,

    xsMedium: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xs, // 12px
      fontWeight: FontWeights.medium,
      lineHeight: 16,
    } as TextStyle,
  },

  // Button text styles
  button: {
    primary: {
      fontFamily: Fonts.sans,
      fontSize: 15, // 0.9375rem
      fontWeight: FontWeights.semibold,
      lineHeight: 20,
    } as TextStyle,

    secondary: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.sm, // 14px
      fontWeight: FontWeights.medium,
      lineHeight: 20,
    } as TextStyle,
  },

  // Tag/chip text styles
  tag: {
    default: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xs, // 12px
      fontWeight: FontWeights.medium,
      lineHeight: 16,
    } as TextStyle,
  },

  // Caption styles
  caption: {
    default: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xs, // 12px
      fontWeight: FontWeights.normal,
      lineHeight: 16,
    } as TextStyle,

    medium: {
      fontFamily: Fonts.sans,
      fontSize: FontSizes.xs, // 12px
      fontWeight: FontWeights.medium,
      lineHeight: 16,
    } as TextStyle,
  },
};

/**
 * Helper function to combine text styles
 * Usage: const style = combineTextStyles(Typography.body.base, { color: Colors.dark.text })
 */
export const combineTextStyles = (...styles: TextStyle[]): TextStyle => {
  return Object.assign({}, ...styles);
};
