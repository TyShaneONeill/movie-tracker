/**
 * Native purchases bridge (iOS / Android)
 * Metro picks this file on native builds; the .ts stub is picked on web.
 */
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

export { Purchases, LOG_LEVEL };
export const isNativeAvailable = true;
