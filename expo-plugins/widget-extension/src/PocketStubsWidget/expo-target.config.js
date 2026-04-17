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
  // Mirror the main app's App Group so the widget can read shared data later.
  entitlements: {
    "com.apple.security.application-groups":
      config?.ios?.entitlements?.["com.apple.security.application-groups"] ?? [
        "group.com.pocketstubs.app",
      ],
  },
});
