/**
 * PocketStubs Design System
 * Color palette, spacing, and border radius constants matching ui-mocks/styles.css
 */

import { Platform } from 'react-native';

// Color Palette - Zinc/Rose/Emerald based design system
export const Colors = {
  dark: {
    // Base Colors
    background: '#09090b',        // Zinc 950 - Primary background
    backgroundSecondary: '#18181b', // Zinc 900 - Secondary surfaces
    card: '#27272a',               // Zinc 800 - Card backgrounds
    glass: 'rgba(24, 24, 27, 0.7)', // Glass effect base

    // Text Colors
    text: '#fafafa',               // Zinc 50 - Primary text
    textSecondary: '#a1a1aa',      // Zinc 400 - Secondary text
    textTertiary: '#71717a',       // Zinc 500 - Tertiary text

    // Accent Colors
    tint: '#e11d48',               // Rose 600 - Primary accent
    accentHover: '#be123c',        // Rose 700 - Hover state
    accentSecondary: '#10b981',    // Emerald 500 - Success/positive
    gold: '#fbbf24',               // Amber 400 - Premium/highlights
    blue: '#00BFFF',               // Deep sky blue - Watching status
    error: '#ef4444',               // Red 500 - Error states

    // UI Elements
    border: 'rgba(255, 255, 255, 0.08)',
    icon: '#a1a1aa',
    tabIconDefault: '#a1a1aa',
    tabIconSelected: '#e11d48',
  },
  light: {
    // Base Colors
    background: '#f4f4f5',          // Zinc 100 - Subtle gray so ticket cutouts show against white cards
    backgroundSecondary: '#e4e4e7', // Zinc 200
    card: '#ffffff',
    glass: 'rgba(255, 255, 255, 0.8)',

    // Text Colors
    text: '#18181b',               // Zinc 900 - Primary text
    textSecondary: '#52525b',      // Zinc 600 - Secondary text
    textTertiary: '#a1a1aa',       // Zinc 400 - Tertiary text

    // Accent Colors (same as dark mode)
    tint: '#e11d48',               // Rose 600
    accentHover: '#be123c',        // Rose 700
    accentSecondary: '#10b981',    // Emerald 500
    gold: '#fbbf24',               // Amber 400
    blue: '#00BFFF',               // Deep sky blue - Watching status
    error: '#dc2626',               // Red 600 - Error states (darker for light bg)

    // UI Elements
    border: 'rgba(0, 0, 0, 0.08)',
    icon: '#52525b',
    tabIconDefault: '#52525b',
    tabIconSelected: '#e11d48',
  },
};

// Gradients
export const Gradients = {
  main: ['#e11d48', '#be123c'],    // Rose gradient
  overlayDark: [
    'rgba(9, 9, 11, 0)',
    'rgba(9, 9, 11, 0.8)',
    'rgba(9, 9, 11, 1)',
  ],
  overlayLight: [
    'rgba(255, 255, 255, 0)',
    'rgba(255, 255, 255, 0.8)',
    'rgba(255, 255, 255, 1)',
  ],
};

// Spacing System
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border Radius
export const BorderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
};

// Shadows (iOS/Android compatible)
export const Shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    android: {
      elevation: 4,
    },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
    },
    android: {
      elevation: 8,
    },
    default: {},
  }),
};

// Font families - using expo-google-fonts naming convention
// Each weight requires its own font family name
export const Fonts = {
  // Inter variants (body text)
  inter: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  // Outfit variants (headings/display)
  outfit: {
    regular: 'Outfit_400Regular',
    medium: 'Outfit_500Medium',
    semibold: 'Outfit_600SemiBold',
    bold: 'Outfit_700Bold',
    extrabold: 'Outfit_800ExtraBold',
  },
  // Legacy aliases for backwards compatibility
  sans: Platform.select({
    ios: 'Inter_400Regular',
    android: 'Inter_400Regular',
    web: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    default: 'Inter_400Regular',
  }),
  display: Platform.select({
    ios: 'Outfit_700Bold',
    android: 'Outfit_700Bold',
    web: "Outfit, 'SF Pro Rounded', sans-serif",
    default: 'Outfit_700Bold',
  }),
};

// Typography presets (to be used in typography.ts)
export const FontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
};

export const FontWeights = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};
