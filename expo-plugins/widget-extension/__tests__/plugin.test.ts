/**
 * Phase 1 Task 2 — Widget Extension config plugin tests.
 *
 * These are intentionally snapshot-style: we verify the target config
 * surface we own (expo-target.config.js) and that the `@bacons/apple-targets`
 * plugin entry point is callable with the shape we pass it. We do NOT
 * exercise the full Xcode project mutation here — that would require
 * mocking the entire `@bacons/xcode` pipeline. End-to-end validation is
 * done by running `npx expo prebuild` in CI/local.
 */

import path from "path";

const TARGET_DIR = path.join(
  __dirname,
  "..",
  "src",
  "PocketStubsWidget",
);

type TargetConfig = {
  type: string;
  name?: string;
  displayName?: string;
  bundleIdentifier?: string;
  deploymentTarget?: string;
  frameworks?: string[];
  entitlements?: Record<string, unknown>;
};

type TargetConfigFn = (config: {
  ios?: { entitlements?: Record<string, unknown> };
}) => TargetConfig;

const loadTargetConfig = (): TargetConfigFn => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path.join(TARGET_DIR, "expo-target.config.js"));
};

describe("PocketStubsWidget — expo-target.config.js", () => {
  const appGroup = "group.com.pocketstubs.app";
  const fakeExpoConfig = {
    ios: {
      bundleIdentifier: "com.pocketstubs.app",
      entitlements: {
        "com.apple.security.application-groups": [appGroup],
      },
    },
  };

  it("exports a function that returns a widget target config", () => {
    const fn = loadTargetConfig();
    expect(typeof fn).toBe("function");
    const result = fn(fakeExpoConfig);
    expect(result.type).toBe("widget");
  });

  it("uses the PocketStubsWidget name and display name", () => {
    const result = loadTargetConfig()(fakeExpoConfig);
    expect(result.name).toBe("PocketStubsWidget");
    expect(result.displayName).toBe("PocketStubs");
  });

  it("appends bundle id to main app (dot-prefixed identifier)", () => {
    const result = loadTargetConfig()(fakeExpoConfig);
    // Dot-prefix is the @bacons/apple-targets convention for
    // "append to main app bundle id" -> com.pocketstubs.app.PocketStubsWidget
    expect(result.bundleIdentifier).toBe(".PocketStubsWidget");
  });

  it("targets iOS 16.0 to match main app deployment target", () => {
    const result = loadTargetConfig()(fakeExpoConfig);
    expect(result.deploymentTarget).toBe("16.0");
  });

  it("links WidgetKit and SwiftUI", () => {
    const result = loadTargetConfig()(fakeExpoConfig);
    expect(result.frameworks).toEqual(
      expect.arrayContaining(["WidgetKit", "SwiftUI"]),
    );
  });

  it("mirrors the main app's App Group entitlement", () => {
    const result = loadTargetConfig()(fakeExpoConfig);
    const groups = (result.entitlements as {
      "com.apple.security.application-groups"?: string[];
    })["com.apple.security.application-groups"];
    expect(groups).toEqual([appGroup]);
  });

  it("falls back to the canonical App Group if main app config omits it", () => {
    const result = loadTargetConfig()({ ios: { entitlements: {} } });
    const groups = (result.entitlements as {
      "com.apple.security.application-groups"?: string[];
    })["com.apple.security.application-groups"];
    expect(groups).toEqual(["group.com.pocketstubs.app"]);
  });
});

describe("@bacons/apple-targets plugin wiring", () => {
  // Expo resolves plugin entry points via `<pkg>/app.plugin.js` first, falling
  // back to the package main. The `app.plugin.js` entry is the config-plugin
  // function itself; the package main exposes runtime ExtensionStorage helpers.
  it("app.plugin entry exports an Expo Config Plugin function", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = require("@bacons/apple-targets/app.plugin");
    expect(typeof plugin).toBe("function");
  });

  it("is registered in app.config.js with the expected root path", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appConfig = require("../../../app.config.js").default;
    const entry = appConfig.expo.plugins.find(
      (p: unknown) =>
        Array.isArray(p) && p[0] === "@bacons/apple-targets",
    ) as [string, { root: string }] | undefined;
    expect(entry).toBeDefined();
    expect(entry![1].root).toBe("./expo-plugins/widget-extension/src");
  });

  it("is positioned after expo-build-properties so deployment target is applied first", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appConfig = require("../../../app.config.js").default;
    const names = appConfig.expo.plugins.map((p: unknown) =>
      Array.isArray(p) ? p[0] : p,
    );
    const buildPropsIdx = names.indexOf("expo-build-properties");
    const applePluginIdx = names.indexOf("@bacons/apple-targets");
    expect(buildPropsIdx).toBeGreaterThanOrEqual(0);
    expect(applePluginIdx).toBeGreaterThan(buildPropsIdx);
  });
});
