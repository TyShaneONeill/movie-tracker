/**
 * Default (non-iOS) stub for the WidgetBridge native module.
 *
 * The real bridge lives in index.ios.ts and calls requireNativeModule at
 * import time. That call throws on any platform where WidgetBridgeModule
 * isn't registered (web, android) — which on web produces an uncaught
 * module-load error that white-screens the app bundle before _layout.tsx
 * can even run its Platform.OS guards.
 *
 * Metro's platform resolver picks index.ios.ts on iOS and falls through to
 * this file everywhere else (web, android, jest). The stub's methods
 * resolve without side effects; callers in lib/widget-bridge.ts already
 * short-circuit with `if (Platform.OS !== 'ios') return;` so these no-ops
 * only run in test contexts where the module is usually jest.mocked anyway.
 *
 * See expo-module.config.json — this module is declared "platforms": ["ios"].
 */
type WidgetBridgeModule = {
  writeWidgetData(json: string): Promise<void>;
  writePosterFile(filename: string, base64: string): Promise<void>;
  writeAuthToken(json: string): Promise<void>;
  reloadWidgetTimelines(): Promise<void>;
};

const stub: WidgetBridgeModule = {
  writeWidgetData: async () => {},
  writePosterFile: async () => {},
  writeAuthToken: async () => {},
  reloadWidgetTimelines: async () => {},
};

export default stub;
