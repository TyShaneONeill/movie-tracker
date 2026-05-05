import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light
): void {
  if (Platform.OS !== 'web') {
    // Swallow rejections — taptic engine throttling and simulator absence
    // both reject; neither is actionable.
    Haptics.impactAsync(style).catch(() => {});
  }
}

export function hapticNotification(
  type: Haptics.NotificationFeedbackType
): void {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(type).catch(() => {});
  }
}

export function hapticSelection(): void {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
}
