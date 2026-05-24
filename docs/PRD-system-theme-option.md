# PRD: Expose System Theme Option in Settings

## Overview

The app already supports a `'system'` theme value in code, but the
Settings UI only shows a binary Light/Dark switch. This PRD covers
updating the Settings UI to expose the three-way choice that the theme
layer already understands.

Source: Testers Community feedback report (2026-05), item 5.

---

## Problem Statement

The theme system in `lib/theme-context.tsx`:

- Accepts `'light' | 'dark' | 'system'`.
- Defaults to `'system'`.
- Stores the preference in AsyncStorage under
  `pocketstubs_theme_preference`.
- Mirrors the preference to Supabase `profiles.theme_preference`.
- Uses `useColorScheme()` and `useEffectiveColorScheme()` so system
  changes already propagate live.

However, the Settings screen at `app/settings/index.tsx:230-236`
exposes only a binary "Dark Mode" switch. Users who installed the app
and want it to follow their phone's appearance setting have no way to
select that explicitly from the UI - and if they ever tap the switch,
they're locked out of system-following until reinstall.

The tester also called out "Real-Time Adaptation: changes to the system
theme trigger immediate adaptations in the app without requiring a
restart." Code already supports this - just needs verification.

---

## Goals

### Primary Goals
1. Replace the binary Dark Mode switch with an explicit Light / Dark /
   System selector.
2. Verify live system-theme changes propagate without restart.

### Success Metrics
- Zero regressions in theme persistence.
- Manual QA confirms switching iOS / Android system appearance updates
  the app immediately when set to System.

---

## Feature Requirements

### P0 - Must Have
- [ ] Remove the existing `<Switch>` for "Dark Mode" in
      `app/settings/index.tsx`.
- [ ] Add a three-option selector bound to `useTheme().setTheme(...)`:
      - Light
      - Dark
      - System (Default)
- [ ] Selector style matches existing Settings rows (segmented control
      or radio list - see existing notification preference rows for the
      pattern).
- [ ] Current selection visibly checked / highlighted.
- [ ] Verify `useEffectiveColorScheme()` updates immediately when
      `Appearance` changes while `theme === 'system'`.

### P1 - Should Have
- [ ] Subtle helper text under the selector when System is chosen:
      "Pocketstubs will follow your device's appearance setting."

### Out of Scope
- New theme tokens, palette changes, or new themes.
- Per-screen overrides.

---

## Technical Considerations

UI sketch:

```tsx
const { theme, setTheme } = useTheme(); // theme: 'light' | 'dark' | 'system'

<SettingsSection title="Appearance">
  <SegmentedOption
    options={[
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
      { label: 'System', value: 'system' },
    ]}
    value={theme}
    onChange={setTheme}
  />
</SettingsSection>
```

No schema changes. No migration - existing users who have
`theme_preference = 'light'` or `'dark'` keep that value; new installs
default to `'system'` as today.

---

## Privacy & Security

No change. Preference already syncs to Supabase.

---

## User Flow

1. User opens Settings.
2. Appearance section shows three options with the current one
   highlighted.
3. Tap System -> immediately reflects the device's current appearance,
   and follows future changes live.
4. Tap Light / Dark -> immediate switch, persisted to AsyncStorage and
   Supabase as today.

---

## Open Questions

1. Segmented control vs. list of radio rows - which matches the rest of
   Settings best? Recommend segmented for compactness; check Figma if a
   spec exists.

---

## Implementation Phases

### Sprint 1 (bundled with PRD-1 in same PR)
- [ ] Implement selector.
- [ ] Verify live system-change propagation on iOS + Android.
- [ ] Update screenshots for Play Store / App Store if shipping.

---

*Last Updated: 2026-05-24*
*Status: Draft - Pending Review*
