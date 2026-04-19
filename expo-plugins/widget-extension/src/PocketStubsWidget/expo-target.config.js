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
  // iOS 17.0 required for Button(intent:) inside a widget (interactive widgets).
  // Main app stays on iOS 16.0; users on iOS 16 install the app but simply
  // don't see the widget in their gallery.
  deploymentTarget: "17.0",
  frameworks: ["WidgetKit", "SwiftUI"],
  // Supabase config reaches the widget via App Groups (see AuthTokenReader.swift
  // + hooks/use-auth-token-sync.ts), NOT via Info.plist — @bacons/apple-targets'
  // infoPlist block doesn't reliably propagate env vars into the widget target.
  // Mirror the main app's App Group so the widget can read shared data.
  // Phase 2 uses App Groups (not Keychain Sharing) for auth token exchange,
  // so keychain-access-groups is intentionally absent here - App Groups alone
  // covers both widget data AND auth token.
  entitlements: {
    "com.apple.security.application-groups":
      config?.ios?.entitlements?.["com.apple.security.application-groups"] ?? [
        "group.com.pocketstubs.app",
      ],
  },
});
