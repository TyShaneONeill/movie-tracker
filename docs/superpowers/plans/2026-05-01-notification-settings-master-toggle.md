# Notification Settings Master Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `app/settings/notifications.tsx` from "single feature toggle that side-effects iOS permission" to "master toggle (iOS permission state) + conditional per-feature toggles". Add `tv_episode_reminders` feature toggle. Fix the default-ON bug in `useNotificationPreference`.

**Architecture:** Master toggle's value is derived from `usePushNotifications().permissionStatus`. Per-feature toggles render only when status is `'granted'`. New default OFF for feature toggles. Two new files lightly touched (type extension + hook default flip), one big refactor of the screen, comprehensive test rewrite.

**Tech Stack:** TypeScript, React Native, Expo Router, expo-notifications, TanStack Query (existing), Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-05-01-notification-settings-master-toggle-design.md`

**Worktree:** Already created at `/Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings/` (off `origin/main` at `32e36f0`, branch `feat/notification-settings-master-toggle`). Spec already committed at `68df75b`. All commands run from this worktree.

---

## File Map

| File | Type | Responsibility |
|---|---|---|
| `lib/notification-preferences-service.ts` | modify | Extend `NotificationFeature` union to include `'tv_episode_reminders'` |
| `hooks/use-notification-preferences.ts` | modify | Change `enabled: query.data ?? true` → `?? false` (default OFF) |
| `app/settings/notifications.tsx` | refactor | Master + conditional per-feature toggle UX. Add TV episode toggle. Add "Open Settings" link for denied state. |
| `__tests__/app/settings/notifications.test.tsx` | rewrite | Replace tests for old UX with new master+features test suite |

No SQL / edge function / migration changes.

---

## Task 1: Setup — extend NotificationFeature type, write failing tests

**Files:**
- Modify: `lib/notification-preferences-service.ts` (1-line type extension so test file compiles)
- Rewrite: `__tests__/app/settings/notifications.test.tsx` (new test suite for the new UX)

**Why:** TDD setup. Extending the type makes the new test file compile. The test rewrite captures the new UX contract — every test will fail until Task 2 makes the screen match.

- [ ] **Step 1.1: Extend `NotificationFeature` type**

In `lib/notification-preferences-service.ts`, find:

```typescript
export type NotificationFeature = 'release_reminders';
```

Replace with:

```typescript
export type NotificationFeature = 'release_reminders' | 'tv_episode_reminders';
```

- [ ] **Step 1.2: Replace the test file with the new suite**

Replace the entire contents of `__tests__/app/settings/notifications.test.tsx` with:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationsSettingsScreen from '@/app/settings/notifications';
import * as prefService from '@/lib/notification-preferences-service';
import * as pushHook from '@/hooks/use-push-notifications';
import * as analyticsModule from '@/lib/analytics';

jest.mock('@/lib/notification-preferences-service', () => ({
  getNotificationPreference: jest.fn(),
  setNotificationPreference: jest.fn(),
}));
jest.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ hapticImpact: jest.fn() }));
jest.mock('@/lib/theme-context', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}));

const getPrefMock = prefService.getNotificationPreference as jest.Mock;
const setPrefMock = prefService.setNotificationPreference as jest.Mock;
const usePushMock = pushHook.usePushNotifications as jest.Mock;
const trackSpy = jest.spyOn(analyticsModule.analytics, 'track');
const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

function wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  getPrefMock.mockResolvedValue(null);
  setPrefMock.mockResolvedValue(undefined);
});

describe('NotificationsSettingsScreen — undetermined permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('renders the master Push Notifications toggle in OFF state', async () => {
    const { findByLabelText, queryByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications', {}, { timeout: 8000 });
    expect(master.props.value).toBe(false);
    // Per-feature toggles hidden until permission is granted
    expect(queryByLabelText('Release reminders')).toBeNull();
    expect(queryByLabelText('TV episode reminders')).toBeNull();
  }, 15000);

  it('tapping master toggle calls requestPermission', async () => {
    const requestPermission = jest.fn().mockResolvedValue(true);
    usePushMock.mockReturnValue({
      permissionStatus: 'undetermined',
      requestPermission,
      isAvailable: true,
    });
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications');
    fireEvent(master, 'valueChange', true);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
  });
});

describe('NotificationsSettingsScreen — granted permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'granted',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('renders both per-feature toggles defaulting OFF when no DB rows exist', async () => {
    getPrefMock.mockResolvedValue(null);
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders', {}, { timeout: 8000 });
    const tv = await findByLabelText('TV episode reminders');
    expect(release.props.value).toBe(false);
    expect(tv.props.value).toBe(false);
  }, 15000);

  it('toggling release_reminders ON calls setNotificationPreference and fires analytics', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const release = await findByLabelText('Release reminders');
    fireEvent(release, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('release_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'release_reminders',
      enabled: true,
    });
  });

  it('toggling tv_episode_reminders ON calls setNotificationPreference with the right key', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const tv = await findByLabelText('TV episode reminders');
    fireEvent(tv, 'valueChange', true);
    await waitFor(() =>
      expect(setPrefMock).toHaveBeenCalledWith('tv_episode_reminders', true)
    );
    expect(trackSpy).toHaveBeenCalledWith('notifications:toggle_changed', {
      feature: 'tv_episode_reminders',
      enabled: true,
    });
  });

  it('tapping master toggle while granted opens iOS Settings', async () => {
    const { findByLabelText } = render(<NotificationsSettingsScreen />, { wrapper });
    const master = await findByLabelText('Push Notifications');
    expect(master.props.value).toBe(true);
    fireEvent(master, 'valueChange', false);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
});

describe('NotificationsSettingsScreen — denied permission', () => {
  beforeEach(() => {
    usePushMock.mockReturnValue({
      permissionStatus: 'denied',
      requestPermission: jest.fn(),
      isAvailable: true,
    });
  });

  it('shows Open Settings link and hides per-feature section', async () => {
    const { findByLabelText, queryByLabelText, findByText } = render(
      <NotificationsSettingsScreen />,
      { wrapper }
    );
    const master = await findByLabelText('Push Notifications', {}, { timeout: 8000 });
    expect(master.props.value).toBe(false);
    expect(queryByLabelText('Release reminders')).toBeNull();
    expect(queryByLabelText('TV episode reminders')).toBeNull();
    const openSettings = await findByText(/open settings/i);
    expect(openSettings).toBeTruthy();
  }, 15000);

  it('tapping Open Settings link calls Linking.openURL with app-settings:', async () => {
    const { findByText } = render(<NotificationsSettingsScreen />, { wrapper });
    const link = await findByText(/open settings/i);
    fireEvent.press(link);
    await waitFor(() => expect(openURLSpy).toHaveBeenCalledWith('app-settings:'));
  });
});
```

- [ ] **Step 1.3: Run the new tests to confirm they FAIL (TDD red)**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && npx jest __tests__/app/settings/notifications.test.tsx`

Expected: FAIL — every test will fail because the screen still has the old UX (no master toggle with `accessibilityLabel="Push Notifications"`, no TV episode toggle, no Open Settings link).

- [ ] **Step 1.4: Run typecheck to confirm the type extension compiles**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && npx tsc --noEmit`

Expected: clean. The `'tv_episode_reminders'` literal in the test file is now valid because Step 1.1 extended the union.

- [ ] **Step 1.5: Commit**

```bash
git add lib/notification-preferences-service.ts __tests__/app/settings/notifications.test.tsx
git commit -m "test(notifications): rewrite settings tests for master+feature UX"
```

---

## Task 2: Implement — flip hook default, refactor screen

**Files:**
- Modify: `hooks/use-notification-preferences.ts` (1-character behavioral change)
- Rewrite: `app/settings/notifications.tsx` (master toggle + conditional per-feature section)

**Why:** Make the failing tests from Task 1 pass. Two changes go together because they're a single behavioral migration: feature defaults flip from ON to OFF, and the screen now exposes the master toggle as the gate for showing feature toggles at all.

- [ ] **Step 2.1: Flip the default in `use-notification-preferences.ts`**

In `hooks/use-notification-preferences.ts`, find line 26:

```typescript
    enabled: query.data ?? true,
```

Replace with:

```typescript
    enabled: query.data ?? false,
```

- [ ] **Step 2.2: Replace `app/settings/notifications.tsx` with the master-toggle UX**

Replace the entire contents of `app/settings/notifications.tsx` with:

```tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ContentContainer } from '@/components/content-container';
import { useNotificationPreference } from '@/hooks/use-notification-preferences';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { hapticImpact } from '@/lib/haptics';
import { analytics } from '@/lib/analytics';
import type { NotificationFeature } from '@/lib/notification-preferences-service';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function FeatureToggleRow({
  feature,
  title,
  description,
  colors,
}: {
  feature: NotificationFeature;
  title: string;
  description: string;
  colors: typeof Colors['dark'];
}) {
  const { enabled, setEnabled, isUpdating } = useNotificationPreference(feature);

  const handleToggle = (next: boolean) => {
    hapticImpact();
    setEnabled(next);
    analytics.track('notifications:toggle_changed', {
      feature,
      enabled: next,
    });
  };

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.rowText}>
        <Text
          style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}
        >
          {title}
        </Text>
        <Text
          style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}
        >
          {description}
        </Text>
      </View>
      <ToggleSwitch
        value={enabled}
        onValueChange={handleToggle}
        disabled={isUpdating}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { permissionStatus, requestPermission, isAvailable } = usePushNotifications();

  const handleMasterToggle = async (next: boolean) => {
    hapticImpact();
    if (permissionStatus === 'undetermined') {
      // Tap from undetermined: ask iOS for permission. The hook will refresh
      // permissionStatus automatically; the toggle value re-derives.
      await requestPermission();
      return;
    }
    // Tap from granted or denied: we can't change iOS perm from the app, only
    // direct the user to iOS Settings.
    Linking.openURL('app-settings:').catch(() => {
      // Best-effort; iOS may decline if the URL can't be opened.
    });
  };

  const masterValue = permissionStatus === 'granted';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
        <Text
          style={[styles.title, Typography.display.h4, { color: colors.text }]}
        >
          Notifications
        </Text>
        <View style={{ width: 24 }} />
      </View>
      <ContentContainer>
        <View
          style={[
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowText}>
            <Text
              style={[Typography.body.base, { color: colors.text, fontWeight: '600' }]}
            >
              Push Notifications
            </Text>
            <Text
              style={[Typography.body.sm, { color: colors.textSecondary, marginTop: 2 }]}
            >
              Pushes are required to receive any notifications below.
            </Text>
          </View>
          <ToggleSwitch
            value={masterValue}
            onValueChange={handleMasterToggle}
            disabled={!isAvailable}
            accessibilityLabel="Push Notifications"
          />
        </View>

        {permissionStatus === 'granted' && (
          <View style={styles.featuresSection}>
            <Text
              style={[Typography.body.xs, styles.sectionLabel, { color: colors.textTertiary }]}
            >
              CUSTOMIZE
            </Text>
            <FeatureToggleRow
              feature="release_reminders"
              title="Release reminders"
              description="Get notified when watchlisted movies release."
              colors={colors}
            />
            <FeatureToggleRow
              feature="tv_episode_reminders"
              title="TV episode reminders"
              description="Get notified when new episodes drop on shows you're watching."
              colors={colors}
            />
          </View>
        )}

        {permissionStatus === 'denied' && (
          <View style={styles.deniedSection}>
            <Text
              style={[Typography.body.sm, { color: colors.textSecondary, textAlign: 'center' }]}
            >
              Notifications are off in iOS Settings.
            </Text>
            <Pressable
              onPress={() => {
                hapticImpact();
                Linking.openURL('app-settings:').catch(() => {});
              }}
              hitSlop={10}
              style={styles.openSettingsLink}
            >
              <Text
                style={[Typography.body.base, { color: colors.tint, fontWeight: '600' }]}
              >
                Open Settings →
              </Text>
            </Pressable>
          </View>
        )}

        {!isAvailable && (
          <Text style={[styles.helpText, { color: colors.textTertiary }]}>
            Notifications are not available on this platform.
          </Text>
        )}
      </ContentContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: { textAlign: 'center', flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  rowText: { flex: 1 },
  featuresSection: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  deniedSection: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  openSettingsLink: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  helpText: {
    fontSize: 12,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
```

Note three structural changes from the old screen:
1. The old top-level `useNotificationPreference('release_reminders')` call is gone — feature state lives inside the new `<FeatureToggleRow>` component that owns its own hook call. This lets each feature row be independent.
2. The old top-level `isLoading` short-circuit (returning the spinner) is gone — there's no longer a single source of "loading", since each feature row loads independently and the master toggle never loads (just reads `permissionStatus`).
3. New `handleMasterToggle` replaces the old `handleToggle`. It branches on `permissionStatus`: undetermined → request, granted/denied → open iOS Settings.

- [ ] **Step 2.3: Run the tests to confirm they PASS (TDD green)**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && npx jest __tests__/app/settings/notifications.test.tsx`

Expected: PASS — all 8 tests across the three describe blocks.

- [ ] **Step 2.4: Run lint + typecheck**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && npm run lint && npx tsc --noEmit`

Expected: PASS — 0 errors. (Pre-existing 8 warnings unchanged.)

- [ ] **Step 2.5: Commit**

```bash
git add hooks/use-notification-preferences.ts app/settings/notifications.tsx
git commit -m "feat(notifications): master toggle + per-feature UX with TV episode reminders"
```

---

## Task 3: Final verification + push + PR

**Files:** None — verification + git only.

- [ ] **Step 3.1: Run the full test suite**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && npm run lint && npx tsc --noEmit && npm test`

Expected:
- Lint: 0 errors (8 pre-existing warnings unchanged)
- TypeScript: clean
- Jest: all green. The notifications test count goes from 5 → 8 (existing 5 deleted, 8 new added). Total project test count: 928 → 931.

- [ ] **Step 3.2: Verify the commit log on the branch**

Run: `cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings && git log --oneline origin/main..HEAD`

Expected: 3 commits (in order, oldest first):
1. `docs: add notification settings master-toggle refactor spec`
2. `test(notifications): rewrite settings tests for master+feature UX`
3. `feat(notifications): master toggle + per-feature UX with TV episode reminders`

- [ ] **Step 3.3: Push branch and open PR**

```bash
cd /Users/tyshaneoneill/Documents/movie-tracker-app/cinetrak-notification-settings
git push -u origin feat/notification-settings-master-toggle
gh pr create --title "feat(notifications): master toggle + per-feature UX with TV episode reminders" --body "$(cat <<'EOF'
## Summary

Refactors the Settings → Notifications screen to follow Apple's standard master + per-feature toggle pattern, surfaced during PR #416/#417 device QA when we discovered the existing UI defaulted Release Reminders to ON before iOS permission was ever requested — lying about delivery state.

**Three problems solved together:**

1. **Default-ON bug** — `useNotificationPreference` returned `enabled: query.data ?? true`, so toggles rendered ON before any DB row existed. Combined with the screen's "request permission as a side-effect of the first feature toggle flip" flow, users could see "Release reminders: ON" while iOS had never been asked — pushes silently never delivered. Default flipped to `?? false`.

2. **No master switch** — Feature toggles could be flipped without first asking iOS. Permission request was hidden inside the feature toggle handler. New design: top-level master toggle whose value is derived from `permissionStatus`. Tap from undetermined → iOS prompt fires. Tap from granted/denied → opens iOS Settings (we can't programmatically revoke iOS perm).

3. **TV episode reminders toggle missing** — PR #416 deferred this to a follow-up. Now exposed alongside Release reminders in the Customize section.

## UX

- `permissionStatus === 'undetermined'`: master toggle visible (OFF), no Customize section.
- `permissionStatus === 'granted'`: master toggle ON, Customize section with both feature toggles defaulting OFF.
- `permissionStatus === 'denied'`: master toggle OFF, "Open Settings →" link below directing to iOS Settings, no Customize section.

## Files changed

- `lib/notification-preferences-service.ts` — extends `NotificationFeature` union with `'tv_episode_reminders'`
- `hooks/use-notification-preferences.ts` — `?? true` → `?? false`
- `app/settings/notifications.tsx` — full UX refactor (master + conditional per-feature section)
- `__tests__/app/settings/notifications.test.tsx` — replaces old tests with 8 new cases across 3 permission states

## Test plan

Automated:
- [x] `__tests__/app/settings/notifications.test.tsx` — 8 cases covering undetermined/granted/denied permission states, master toggle behavior, both feature toggles, Open Settings link
- [x] `npm run lint && npx tsc --noEmit && npm test` — all green

Manual device QA on iPhone (after rebuild):
- [ ] Fresh app install (delete + `expo run:ios --device`)
- [ ] Settings → Notifications: master toggle OFF, no Customize visible
- [ ] Tap master → iOS prompts → tap Allow → master flips ON, Customize section appears with both toggles defaulting OFF
- [ ] Toggle Release reminders ON → row created in `notification_preferences`, analytics fires
- [ ] Toggle TV episode reminders ON → row created with new feature key
- [ ] Tap master ON → iOS Settings opens
- [ ] In iOS Settings, toggle Notifications OFF for the app → return to app → Settings → Notifications shows master OFF + Open Settings link
- [ ] Tap Open Settings → iOS Settings opens

## Migration impact

`notification_preferences` table is currently empty for all production users (verified 2026-05-01). The `?? false` default change has zero migration impact today — there are no existing rows to break. Future users start with feature toggles OFF after granting iOS permission, which is the intended new behavior.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of Scope (deliberately deferred per spec)

- Per-show TV opt-out granularity
- Notification time scheduling / quiet hours
- Other feature toggles (social, follows, comments) — added when those features ship push integrations
- Permission re-check when app foregrounds from iOS Settings — current on-mount + on-user-change check is sufficient at v1
- Discord webhook on review-create events
