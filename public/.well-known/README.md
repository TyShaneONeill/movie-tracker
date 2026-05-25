# `.well-known/` — Universal Links & App Links

These files are served from `https://pocketstubs.com/.well-known/` and are how iOS and Android verify that the PocketStubs app is allowed to open `pocketstubs.com` URLs.

Both files MUST be served with `Content-Type: application/json` and MUST be valid JSON (no comments — that's why this README is sibling to them).

## `apple-app-site-association` (iOS Universal Links)

- `appID` is `<Apple Team ID>.<iOS bundle identifier>`.
- Current value: `K32CLCJV45.com.pocketstubs.app`.
- Bundle ID is sourced from `app.config.js` → `ios.bundleIdentifier`.
- Team ID `K32CLCJV45` was carried over from the CineTrak era. The rebrand was at the app-ID level, not the developer account level, so this should still be correct — but verify via Apple Developer portal → Membership, or `eas credentials` → iOS → Distribution (the prefix on the current Distribution cert).

## `assetlinks.json` (Android App Links)

- `package_name` must match `app.config.js` → `android.package` (currently `com.pocketstubs.app`).
- `sha256_cert_fingerprints` is **intentionally left empty** for now. See below.

### Why `sha256_cert_fingerprints` is empty (intentional defer)

The Android app is currently distributed on the **Internal Testing** track only (`track: "internal"` in `eas.json`) — there are **zero public Android users**. With the array empty, Android App Links will silently fail to verify, which means tapping an `https://pocketstubs.com/...` link on an Android device will open Chrome instead of the app. That is acceptable today because no public Android user can hit that path.

This is **not** a pre-merge TODO. We are deliberately shipping with an empty array until the Android app graduates to a public Play Store track. The structural correctness of `assetlinks.json` (correct `package_name`, valid JSON, correct `Content-Type`) is what this PR fixes; populating the fingerprints is a follow-up that gates the **next public Play release**, not this PR.

Follow-up issue tracking the populate-before-public-release work: [link to follow-up issue].

### How to populate `sha256_cert_fingerprints` (when the time comes)

Before the next public Play Store release, the fingerprints MUST be populated or Android App Links will be broken for real users.

You need **both** the upload key fingerprint and the app signing key fingerprint (Google Play re-signs uploads with the app signing key, so both must be trusted).

**EAS managed signing:**

```
eas credentials
# → Android
# → Production
# → "Show details"
# Copy the SHA-256 fingerprint of the upload key.
```

**Google Play Console:**

```
Play Console → (app) → Setup → App Integrity → App signing
# → "App signing key certificate" → copy the SHA-256 line.
# → "Upload key certificate" → copy the SHA-256 line (should match EAS output above).
```

Format must be **uppercase hex with colons**, e.g.:

```json
"sha256_cert_fingerprints": [
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
  "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11"
]
```

## After updating

1. Redeploy the web app so the corrected files are live on `pocketstubs.com/.well-known/`.
2. Verify Apple picks up the AASA: `swcutil dl -d pocketstubs.com` (macOS).
3. Verify Android verification: `adb shell pm verify-app-links --re-verify com.pocketstubs.app`, then `adb shell pm get-app-links com.pocketstubs.app` — both domains should show `verified`.
