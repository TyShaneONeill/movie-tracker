import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light
): void {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style);
  }
}

export function hapticNotification(
  type: Haptics.NotificationFeedbackType
): void {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(type);
  }
}

export function hapticSelection(): void {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync();
  }
}
