import { Linking } from 'react-native';

/**
 * Opens a YouTube video by key. iOS opens the YouTube app if installed,
 * falls back to Safari. Web opens a new tab. No-op on unrecognized keys
 * — Linking.openURL just hits an invalid URL which YouTube handles.
 */
export function openTrailer(youtubeKey: string): Promise<void> {
  return Linking.openURL(`https://youtube.com/watch?v=${youtubeKey}`);
}
