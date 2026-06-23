---
name: build-preflight
description: Run BEFORE any iOS/Android EAS build or store submission for PocketStubs. Validates source freshness, version increments across every platform file, EXPO_PUBLIC secret safety, and required migrations. Trigger on "build iOS/Android", "cut a build", "submit to App Store / Play", "release", "eas build", or before running eas build / npm run ios|android.
---

# Build Pre-flight (PocketStubs / EAS)

Builds here use `appVersionSource: "local"`, so versions live in **different files per platform** and drift silently. This gate exists because we've shipped the wrong versionCode, an iOS build missing `main.jsbundle`, and stale code. Run it before every build.

## Step 1 — run the gate
```bash
npm run preflight            # both platforms; add 'ios' or 'android' to scope
npm run preflight both --full # also runs tsc/lint/test (do this before a real release build)
```
It exits non-zero on blocking issues (stale source, version drift, secret in EXPO_PUBLIC). Read its output; resolve every ✗ and review every ⚠ before continuing. For the real secret check, run it under the target env: `doppler run -p pocketstubs -c <stg|prd> -- npm run check:public-env`.

## Step 2 — where versions actually live (the footgun)
`appVersionSource: "local"` + a local native dir means **app.config.js is ignored for that platform.** Bump the authoritative source:

| Platform | Authoritative source (when native dir exists) | What to bump |
|---|---|---|
| **iOS app** | `ios/PocketStubs/Info.plist` | `CFBundleShortVersionString` (marketing) + `CFBundleVersion` (build) |
| **iOS widget** | `ios/*.xcodeproj/project.pbxproj` | `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION` — **must match the app** or App Store rejects |
| **Android** | `android/app/build.gradle` (if present) — else `app.config.js` `versionCode` | `versionCode` (+ `versionName`) |
| All / record | `app.config.js` | keep `version`/`buildNumber`/`versionCode` aligned for hygiene |

iOS native files are **gitignored (local-only)**, so their versions are NOT recorded in git — the preflight is the only thing that catches drift. Bump every build number vs the **last submitted** build (not just what's in the file).

`runtimeVersion` (`app.config.js`): bump ONLY when native deps change. JS-only changes ship via `eas update` (OTA) without a build.

## Step 3 — confirm intent, then build
- Confirm the bumped numbers are higher than the last App Store / Play submission.
- Confirm the right EAS profile/channel + Doppler config for the target.
- Confirm any migration the build depends on is applied to the **target** DB env.
- Then build (`eas build -p ios|android --profile <profile>`). The user runs this — it's outward-facing and costs EAS credits; don't fire it without explicit go-ahead.

## Step 4 — post-build (iOS)
Before `eas submit`, verify the `.ipa` embeds the JS bundle (a build without it = infinite splash for all users, not OTA-fixable):
```bash
npm run verify:ios-bundle
```

## Notes
- This complements the always-on guards: `eas-build-pre-install` runs `check:public-env`, `eas-build-on-success` runs `verify:ios-bundle`.
- The deterministic logic lives in `scripts/preflight-build.sh`; this skill is the human-facing wrapper. Update the script when build invariants change.
