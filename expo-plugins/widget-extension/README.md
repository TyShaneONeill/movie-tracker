# PocketStubs Widget Extension

iOS 16+ home-screen widget for PocketStubs. This directory holds the
**source-of-truth** Swift, Info.plist, and target-config files that
`@bacons/apple-targets` injects into the generated Xcode project on every
`npx expo prebuild --platform ios`.

## Why `@bacons/apple-targets`?

Task 2 of the Widget Phase 1 plan evaluated three options:

| Package                           | Status          | Notes                                                                       |
| --------------------------------- | --------------- | --------------------------------------------------------------------------- |
| **`@bacons/apple-targets@4.0.6`** | **Chosen**      | Author: Evan Bacon (Expo core). Peer dep `expo >=52` (we are on 54). Covers widgets, Live Activities, share, intents, watch, more. Actively maintained, referenced by the official Expo blog. |
| `@mozzius/expo-apple-targets`     | Rejected        | Unmaintained fork of `@bacons/apple-targets`, last release predates SDK 54. |
| `react-native-widget-extension`   | Rejected        | Only handles Live Activities, not WidgetKit home-screen widgets. Wrong shape for this task. |
| Hand-rolled `@expo/config-plugins` + `xcode`                | Rejected        | Spec guardrail: "days of brittle work." Would require us to own PBXNativeTarget mutation, Copy-Files phase insertion, entitlements synthesis, scheme creation, CocoaPods target hook. Not justified vs. a well-tested library. |

Rationale in one sentence: Bacon's plugin is the only option that is both (a) maintained against modern Expo SDKs and (b) scoped to generic Apple targets including WidgetKit, so it is the lowest-risk way to get a compilable widget extension into prebuild output.

## Layout

```
expo-plugins/widget-extension/
├── README.md                      ← this file
├── src/
│   └── PocketStubsWidget/
│       ├── expo-target.config.js  ← target type, bundle id, entitlements
│       ├── PocketStubsWidget.swift        ← timeline provider + view
│       └── PocketStubsWidgetBundle.swift  ← @main entry point
└── __tests__/
    └── plugin.test.ts             ← snapshot-style assertions
```

The plugin is registered in `app.config.js` with a custom `root` so that
all widget sources live under `expo-plugins/` instead of the package
default of `/targets/`:

```js
plugins: [
  ["expo-build-properties", { ios: { deploymentTarget: "16.0" } }],
  ["@bacons/apple-targets", { root: "./expo-plugins/widget-extension/src" }],
  // ...
],
```

## What the plugin injects on prebuild

Running `npx expo prebuild --platform ios --clean` produces, under `ios/`:

1. A new `PocketStubsWidget/` directory mirroring the source directory.
2. An Xcode target `PocketStubsWidget` with:
   - product type `com.apple.product-type.app-extension`
   - `NSExtensionPointIdentifier = com.apple.widgetkit-extension`
   - deployment target `16.0`
   - frameworks `WidgetKit` + `SwiftUI`
   - bundle id `com.pocketstubs.app.PocketStubsWidget`
   - `App Groups` entitlement `group.com.pocketstubs.app`
3. A `PBXCopyFilesBuildPhase` ("Embed App Extensions") on the main app that
   embeds the widget into the `.app` bundle.

## Guardrails for later tasks

- **Task 3** (real widget UI) replaces the contents of `PocketStubsWidget.swift` and `PocketStubsWidgetBundle.swift`. It must **not** touch `expo-target.config.js` unless adding a family or framework.
- **Do not** edit anything inside `ios/PocketStubsWidget/` — that directory is regenerated on every prebuild and is gitignored.
- The widget target's deployment target is hard-set to 16.0 here to match the main app. If the main app deployment target bumps, update `expo-target.config.js` in lockstep.

## Testing

```bash
npm test expo-plugins/widget-extension
npx tsc --noEmit
npx expo prebuild --platform ios --clean
xcodebuild -project ios/PocketStubs.xcodeproj -list | grep PocketStubsWidget
```

The snapshot test asserts that the plugin receives the expected shape and
that `require`-ing the target config returns the expected fields (type,
name, bundleIdentifier, deploymentTarget, entitlements). Heavier
integration coverage lives in the real prebuild verification step, not in
unit tests, because mocking the full `@bacons/xcode` pipeline would be
fragile and offer little value.
