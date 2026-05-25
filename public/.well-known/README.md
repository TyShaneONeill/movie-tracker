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
- `sha256_cert_fingerprints` MUST be populated for Android App Links to verify. It is currently empty — Android App Links will silently fail to verify until this is filled in.

### How to populate `sha256_cert_fingerprints`

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
