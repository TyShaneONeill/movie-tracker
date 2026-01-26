/**
 * CineTrak Typography System
 * Font presets and text styles matching ui-mocks/styles.css
 *
 * Note: With expo-google-fonts, each weight is a separate font family.
 * We use fontFamily to specify the weight instead of fontWeight.
 */

import { TextStyle } from 'react-native';
import { Fonts, FontSizes } from './theme';

/**
 * Base text style presets
 * Use these as building blocks for component text styles
 */
export const Typography = {
  // Display styles (using Outfit font for headings)
  display: {
    // Brand title - matches .text-2xl from CSS (2rem/32px, weight 800)
    brand: {
      fontFamily: Fonts.outfit.extrabold,
      fontSize: 32, // 2rem
      lineHeight: 36,
    } as TextStyle,

    h1: {
      fontFamily: Fonts.outfit.bold,
      fontSize: FontSizes['4xl'], // 36px
      lineHeight: 40,
    } as TextStyle,

    h2: {
      fontFamily: Fonts.outfit.bold,
      fontSize: FontSizes['3xl'], // 30px
      lineHeight: 36,
    } as TextStyle,

    h3: {
      fontFamily: Fonts.outfit.bold,
      fontSize: FontSizes['2xl'], // 24px
      lineHeight: 28,
    } as TextStyle,

    h4: {
      fontFamily: Fonts.outfit.bold,
      fontSize: FontSizes.xl, // 20px
      lineHeight: 24,
    } as TextStyle,
  },

  // Body text styles (using Inter font)
  body: {
    xlBold: {
      fontFamily: Fonts.inter.bold,
      fontSize: FontSizes.xl, // 20px
      lineHeight: 28,
    } as TextStyle,

    lg: {
      fontFamily: Fonts.inter.semibold,
      fontSize: FontSizes.lg, // 18px
      lineHeight: 26,
    } as TextStyle,

    lgRegular: {
      fontFamily: Fonts.inter.regular,
      fontSize: FontSizes.lg, // 18px
      lineHeight: 26,
    } as TextStyle,

    base: {
      fontFamily: Fonts.inter.regular,
      fontSize: FontSizes.base, // 16px
      lineHeight: 24,
    } as TextStyle,

    baseMedium: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.base, // 16px
      lineHeight: 24,
    } as TextStyle,

    sm: {
      fontFamily: Fonts.inter.regular,
      fontSize: FontSizes.sm, // 14px
      lineHeight: 20,
    } as TextStyle,

    smMedium: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.sm, // 14px
      lineHeight: 20,
    } as TextStyle,

    xs: {
      fontFamily: Fonts.inter.regular,
      fontSize: FontSizes.xs, // 12px
      lineHeight: 16,
    } as TextStyle,

    xsMedium: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.xs, // 12px
      lineHeight: 16,
    } as TextStyle,
  },

  // Button text styles
  button: {
    primary: {
      fontFamily: Fonts.inter.semibold,
      fontSize: 15, // 0.9375rem
      lineHeight: 20,
    } as TextStyle,

    secondary: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.sm, // 14px
      lineHeight: 20,
    } as TextStyle,
  },

  // Tag/chip text styles
  tag: {
    default: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.xs, // 12px
      lineHeight: 16,
    } as TextStyle,
  },

  // Caption styles
  caption: {
    default: {
      fontFamily: Fonts.inter.regular,
      fontSize: FontSizes.xs, // 12px
      lineHeight: 16,
    } as TextStyle,

    medium: {
      fontFamily: Fonts.inter.medium,
      fontSize: FontSizes.xs, // 12px
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
