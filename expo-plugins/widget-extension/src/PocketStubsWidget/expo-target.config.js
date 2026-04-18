/**
 * Expo target config consumed by @bacons/apple-targets.
 *
 * This file is auto-discovered by the plugin when `withTargetsDir` is run
 * with `root: "./expo-plugins/widget-extension/src"`. For every subdirectory
 * containing `expo-target.config.{js,json}`, the plugin generates a matching
 * Apple target in the Xcode project on `npx expo prebuild`.
 *
 * IMPORTANT: Do not hand-edit the generated Xcode project. Change this file
 * (or the Swift sources next to it) and re-run prebuild.
 */

/** @type {import('@bacons/apple-targets').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "PocketStubsWidget",
  displayName: "PocketStubs",
  // Prefix with dot so the plugin appends to the root bundle id:
  //   com.pocketstubs.app + .PocketStubsWidget => com.pocketstubs.app.PocketStubsWidget
  bundleIdentifier: ".PocketStubsWidget",
  deploymentTarget: "16.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  // Inject Supabase config so Swift code can read via Bundle.main.object(forInfoDictionaryKey:)
  infoPlist: {
    SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Mirror the main app's App Group so the widget can read shared data.
  // keychain-access-groups allows reading the Supabase JWT written by the main app.
  entitlements: {
    "com.apple.security.application-groups":
      config?.ios?.entitlements?.["com.apple.security.application-groups"] ?? [
        "group.com.pocketstubs.app",
      ],
    "keychain-access-groups": ["$(AppIdentifierPrefix)com.pocketstubs.app"],
  },
});
