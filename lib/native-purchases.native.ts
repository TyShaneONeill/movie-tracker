/**
 * Native purchases bridge (iOS / Android)
 * Metro picks this file on native builds; the .ts stub is picked on web.
 *
 * react-native-purchases is NOT imported here — doing so executes module-level
 * initialization code (NativeEventEmitter, listener registration) that crashes
 * on iOS 26.4 beta. The module is loaded lazily via dynamic import inside
 * initRevenueCatNative() only when the user attempts a purchase.
 */
export const isNativeAvailable = true;
