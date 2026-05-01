# Design Spec: Notification Settings Master Toggle + Per-Feature Toggles

**Date**: 2026-05-01
**Status**: Ready for implementation
**Scope**: Refactor `app/settings/notifications.tsx` to a master-toggle + per-feature-toggles UX. Add `tv_episode_reminders` feature toggle (deferred from PR #416). Fix the default-ON bug in `useNotificationPreference`.
**Source**: 2026-05-01 device QA discovery — current UI shows `release_reminders` toggle ON by default before iOS permission has been requested, lying about the actual delivery state. Tyshane proposed Apple-standard master+feature pattern.

---

## Why this PR

Three problems converge:

1. **Default-ON bug:** `useNotificationPreference` returns `enabled: query.data ?? true` (line 26 of `hooks/use-notification-preferences.ts`). When no `notification_preferences` row exists, the toggle renders ON. Combined with the current notifications screen that defers iOS permission request to the first feature toggle flip, users see "Release reminders: ON" but iOS will never actually deliver pushes because permission was never requested.

2. **No master switch:** Per-feature toggles can be flipped without first asking iOS for permission. The flow is opaque — user has no idea why no pushes arrive.

3. **TV episode reminders toggle missing:** PR #416 deferred the `tv_episode_reminders` feature toggle to a follow-up. The `notification_preferences` infrastructure already supports per-feature toggles (default-enabled when no row exists), but the UI doesn't expose the new feature.

This PR addresses all three together because they share the same surface area (`app/settings/notifications.tsx`).

---

## Scope Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Default state of feature toggles when iOS permission first granted | **All features default OFF**. Explicit per-feature opt-in. Removes the "toggle ON but no pushes" lying state. |
| Master toggle semantics | **Reflects iOS permission state**. Source of truth for whether pushes can be delivered. |
| What master toggle does on tap | undetermined → request iOS permission. granted/denied → opens iOS Settings (we can't change perm from app). |
| Per-feature toggles when permission != granted | **Hidden** — no point showing controls that can't deliver. |

---

## State Machine

| iOS permission status | Master toggle state | Per-feature toggles |
|---|---|---|
| `undetermined` (never asked) | OFF, tappable. Tap → calls `requestPermission()` → iOS prompt fires | hidden |
| `granted` | ON, tappable. Tap → opens iOS Settings (`Linking.openURL('app-settings:')`) | rendered, default OFF, individually toggleable |
| `denied` (user previously tapped Don't Allow) | OFF, tappable + small "Open Settings" link below | hidden |

After granting iOS permission, master flips to ON automatically (driven by the `permissionStatus` value from `usePushNotifications`). Per-feature toggles render with their default-OFF state.

---

## UX Layout

```
Settings → Notifications

┌─────────────────────────────────────────────────────────────┐
│ Push Notifications                              [Toggle]    │
│ Pushes are required to receive any notifications below.     │
└─────────────────────────────────────────────────────────────┘

  ─── if permissionStatus === 'granted' ───

  CUSTOMIZE

  ┌─────────────────────────────────────────────────────────┐
  │ Release reminders                            [Toggle]   │
  │ Get notified when watchlisted movies release            │
  └─────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────┐
  │ TV episode reminders                         [Toggle]   │
  │ Get notified when new episodes drop on shows you're     │
  │ watching                                                │
  └─────────────────────────────────────────────────────────┘

  ─── if permissionStatus === 'denied' ───

  Notifications are off in iOS Settings.
  [ Open Settings → ]
```

When `permissionStatus === 'undetermined'`: show only the master toggle row. No "Customize" section, no "Open Settings" link. Tapping the master triggers the iOS permission prompt.

---

## Files to Touch

| # | File | Change |
|---|------|---|
| 1 | `lib/notification-preferences-service.ts` | Extend `NotificationFeature` union: `'release_reminders' \| 'tv_episode_reminders'`. |
| 2 | `hooks/use-notification-preferences.ts` | Change `enabled: query.data ?? true` → `enabled: query.data ?? false` (default OFF). One-character behavioral change. |
| 3 | `app/settings/notifications.tsx` | Refactor from "single feature toggle that side-effects iOS permission" to "master + conditional per-feature section". Add TV episode reminders toggle. Add "Open Settings" link for denied state. |
| 4 | `__tests__/app/settings/notifications.test.tsx` | Extend existing tests — master toggle behavior, conditional rendering by permission state, both feature toggles. |

No backend / SQL / edge function / migration changes. Pure client-side UX refactor.

---

## Detailed Component Behavior

### Master Toggle

- Reads `permissionStatus` and `requestPermission` from `usePushNotifications()` hook (existing).
- Visual `value` prop on the `Switch`:
  - `permissionStatus === 'granted'` → `true`
  - else → `false`
- `onValueChange` handler:
  - If `permissionStatus === 'undetermined'`: call `await requestPermission()`. The hook updates `permissionStatus` automatically; toggle re-renders.
  - If `permissionStatus === 'granted'` OR `'denied'`: open iOS Settings with `Linking.openURL('app-settings:')` via expo-linking (we can't programmatically revoke iOS perm, only direct user there).
- The toggle is purely a *trigger*; it does not directly hold its own state. State is derived from `permissionStatus`.

### Per-Feature Toggles

- Render only when `permissionStatus === 'granted'`.
- Each is independent, calling `useNotificationPreference(feature)` for its own state.
- New default: `?? false` (OFF when no DB row).
- Toggling ON inserts a row with `enabled: true`; toggling OFF inserts/upserts a row with `enabled: false`.
- The existing `useNotificationPreference` mutation flow (insert/upsert) is unchanged.

### Denied State

When `permissionStatus === 'denied'`:
- Master toggle stays OFF visually.
- Below the master row, render a one-liner: `"Notifications are off in iOS Settings."`
- Render a tappable "Open Settings →" pressable that calls `Linking.openURL('app-settings:')`.
- Per-feature toggles remain hidden (they'd be useless even if shown).

### Loading State

`useNotificationPreference` has `isLoading`. While the first feature's preference is loading, render a small `<ActivityIndicator />` instead of the per-feature section. This is the existing pattern — preserve it.

`usePushNotifications` exposes `permissionStatus` directly (no separate loading state); it starts as `'undetermined'` until checked. We treat `undetermined` as a valid renderable state (showing only the master toggle).

---

## Tests

Extend `__tests__/app/settings/notifications.test.tsx` (existing file):

| # | Test | What it verifies |
|---|------|---|
| 1 | renders master toggle in undetermined state | Loads screen with mocked `permissionStatus: 'undetermined'`, asserts master toggle is rendered as OFF, no per-feature section |
| 2 | tapping master in undetermined state calls requestPermission | Mocks `requestPermission`, simulates toggle press, asserts mock called once |
| 3 | renders per-feature toggles when granted | Mocked `permissionStatus: 'granted'`, asserts both `Release reminders` and `TV episode reminders` rows are visible, both default OFF |
| 4 | per-feature toggle defaults OFF | With no DB row mocked, `enabled` resolves to `false` (the `?? false` change) |
| 5 | tapping a feature toggle calls setEnabled with correct feature key | Verifies `release_reminders` and `tv_episode_reminders` mutations fire with the correct keys |
| 6 | denied state shows "Open Settings" link | Mocked `permissionStatus: 'denied'`, asserts link present, no per-feature section |
| 7 | tapping master in granted state opens iOS Settings | Mocked `Linking.openURL`, asserts call with `'app-settings:'` |

The existing tests for the OLD behavior (single feature toggle that side-effects permission) will need to be replaced or removed since the UX changes shape. Plan to:
- Delete obsolete tests for the old toggle handler (which conflated permission request with feature enable)
- Add the new tests above

---

## Migration / Compatibility

- **Default change from `?? true` to `?? false`** in `useNotificationPreference`. With `notification_preferences` currently empty across all users (verified 2026-05-01 — only Tyshane's own dev/test rows; no prod user data), this has zero migration impact today. Future users start with feature toggles OFF after granting iOS permission, which is the intended new behavior.
- **No DB schema change** — the table and indexes are unchanged.
- **No edge function changes** — `send-push-notification` already correctly defaults to "enabled" when no `notification_preferences` row exists. After this PR, users will explicitly create rows for features they want, and the existing fanout logic continues to work unchanged.
- **No analytics taxonomy change** — the existing `analytics.track('notifications:toggle_changed', ...)` event keeps the same shape; the new `feature: 'tv_episode_reminders'` value joins the existing `'release_reminders'`.

---

## Out of Scope (deferred)

- **Per-show TV opt-out** — granular control over which specific TV shows fire push reminders. Future feature.
- **Notification time scheduling / quiet hours** — let users set "don't push between 10pm and 8am". Future feature.
- **Background push delivery hooks** — handle silent pushes for app-state sync. Not needed for this UX.
- **Discord webhook on review-create** — separate ops nicety from PR #415's brainstorm; not notification UX.
- **Other feature toggles** (social, follows, comments) — not currently fanned out as features in `send-push-notification` infrastructure. When those features ship, they add their toggle rows here.
- **Delivery-side default for "no row" — separate follow-up.** This PR fixes the UI showing toggles ON before any user action. However, `send-push-notification` (edge function) still treats "no `notification_preferences` row" as "enabled" — it only suppresses delivery when a row explicitly says `enabled=false`. A granted-permission user who hasn't toggled anything will see UI as OFF but still receive pushes. To fully close the loop, a follow-up PR should either (a) auto-create `enabled=false` rows when iOS permission is granted, or (b) flip the edge function logic to require `enabled=true` for delivery (breaking semantic for any existing on-by-default users — currently zero in production). Out of scope here because it touches edge functions in `send-release-reminders`, `send-tv-episode-reminders`, and `send-push-notification` — separate concern, separate PR.

---

## Verification (manual + automated)

Automated:
- `npm run lint && npx tsc --noEmit && npm test` — all green
- New + existing notifications.test.tsx cases pass

Device QA path on iPhone (after rebuild):
1. Fresh app install (delete old, reinstall via `expo run:ios --device`)
2. Open app → Settings → Notifications
3. Master toggle is OFF, no Customize section visible
4. Tap master toggle → iOS prompts "Allow Notifications" → tap Allow
5. Master flips to ON, Customize section appears with both toggles defaulting OFF
6. Toggle "Release reminders" ON — verify `notification_preferences` row created
7. Toggle "TV episode reminders" ON — verify second row created
8. Tap master toggle while ON → iOS Settings opens for the app
9. In iOS Settings, toggle Notifications OFF for the app → return to app
10. Master toggle reflects OFF, Customize section hidden, "Open Settings" link visible
11. Tap "Open Settings" → iOS Settings opens

---

## Risk Notes

- **Behavioral change**: existing release_reminders default was ON; now it defaults OFF. For Tyshane's dev account this is a non-issue (no prod release_reminders rows existed yet); for future users it's the intended new behavior.
- **Linking.openURL('app-settings:')**: iOS-only URL scheme. The screen is gated by `isAvailable` (Platform.OS !== 'web') so this is fine.
- **Permission denied → user opens iOS Settings → grants → returns to app**: `permissionStatus` is checked via `getPermissionStatus()` on user change in `usePushNotifications`. The hook already re-runs on `user?.id` change. We may want to also re-check when the app foregrounds (returning from iOS Settings). For v1, the existing on-mount + on-user-change check is sufficient — rare edge case to refresh permission state mid-session.

---

## State to verify before merging

- `git log --oneline origin/main` — parent commit `32e36f0` (PR #417)
- `npm run lint && npx tsc --noEmit && npm test` — all green
- Device QA per checklist above — all 11 steps pass
- No regression in existing `release_reminders` flow (toggle ON → row created → push fires per existing cron)

---

*[[Daily Notes/2026-04-30]] · UX cleanup surfaced during PR #416/#417 device QA*
