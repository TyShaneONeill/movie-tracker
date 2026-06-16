import { Platform } from 'react-native';

/**
 * Monospace font for ticket-stub / metadata microcopy.
 *
 * The design calls for JetBrains Mono. PR1 substitutes the platform system
 * monospace to avoid bundling a new font; PR2 can wire up
 * expo-google-fonts/jetbrains-mono and swap this single constant.
 */
export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;
