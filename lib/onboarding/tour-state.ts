import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/sentry';

// Bump suffix (v1 -> v2) when adding/removing major steps so active users get the refreshed tour.
const TOUR_KEY = 'pocketstubs_tour_completed_v1';

export async function hasTourCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(TOUR_KEY);
    return value === 'true';
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'tour-state-read' });
    return false;
  }
}

export async function markTourCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'tour-state-write' });
  }
}

export async function resetTour(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOUR_KEY);
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'tour-state-reset' });
  }
}
