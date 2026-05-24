# PRD: Password Visibility Toggle ("Eye Icon")

## Overview

Add a tap-to-reveal eye icon to every password input in the app so users
can verify what they typed. Currently every password field renders only
`secureTextEntry`, which is a common cause of login errors and password
reset churn.

Source: Testers Community feedback report (2026-05), item 4.

---

## Problem Statement

The app has four password fields:

- `app/(auth)/signin.tsx`
- `app/(auth)/signup.tsx`
- `app/(auth)/forgot-password.tsx` (new-password confirm)
- `app/settings/change-password.tsx`

All of them use `<TextInput secureTextEntry>` with no way to verify
input. On mobile keyboards this leads to:

- Typo-driven failed logins that look like "forgot password" events.
- Mismatched password / confirm-password in signup.
- Increased support load and user frustration.

---

## Goals

### Primary Goals
1. Let users optionally see what they're typing in any password field.
2. Ship a single reusable component so every password field stays in
   sync visually and behaviourally.
3. Default to hidden - reveal is opt-in per field per session.

### Success Metrics
- Sign-in failure rate (from `auth` events) drops within 2 weeks of
  release.
- Support tickets tagged `password` decrease.

---

## Feature Requirements

### P0 - Must Have
- [ ] New `<PasswordInput>` component in `components/forms/`
      wrapping `TextInput` + a `Pressable` eye toggle.
- [ ] Default `secureTextEntry={true}`; toggle flips to `false`.
- [ ] Icon swaps between `eye` and `eye-off` (use the existing icon set
      already imported in auth screens).
- [ ] Adopted in all four password fields listed above.
- [ ] Visible state is per-field, resets when the screen unmounts.
- [ ] Accessible: the eye button has an `accessibilityLabel`
      ("Show password" / "Hide password") and is a 44pt tap target.
- [ ] Works in both light and dark theme.

### P1 - Should Have
- [ ] Auto re-hide on screen blur (e.g., navigating away) so the
      password isn't visible if the user returns later.

### P2 - Nice to Have
- [ ] Subtle haptic on toggle (iOS / Android both supported by Expo Haptics).

### Out of Scope
- Security reminder copy when revealing - adds friction without
  meaningful protection.
- Biometric-gated reveal.
- Strength meter (separate concern, separate PRD if desired).

---

## Technical Considerations

Proposed component shape:

```tsx
// components/forms/PasswordInput.tsx
type PasswordInputProps = Omit<TextInputProps, 'secureTextEntry'> & {
  containerStyle?: ViewStyle;
};

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextInput {...props} secureTextEntry={!visible} />
      <Pressable
        onPress={() => setVisible(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Pressable>
    </View>
  );
}
```

Icons should come from whichever set the auth screens already use
(check `app/(auth)/signin.tsx` imports - likely `lucide-react-native`
or `@expo/vector-icons`). Reuse, don't add a new dependency.

---

## Privacy & Security

- No new data is stored.
- Reveal state lives only in component state, never persisted.
- Document in the in-app help (PRD-4) that users should avoid revealing
  passwords in public.

---

## User Flow

1. User focuses a password field.
2. Eye icon visible inside the field on the trailing edge.
3. Tap to reveal -> icon switches to eye-off, characters show in clear.
4. Tap again -> back to masked.
5. Navigating away from the screen resets to masked.

---

## Open Questions

1. Should the toggle appear only when the field is non-empty, or always?
   Recommendation: always - simpler and more discoverable.
2. Should the new-password and confirm-password fields in signup share
   a single reveal state, or be independent? Recommendation: independent.

---

## Implementation Phases

### Sprint 1 (this PR)
- [ ] Build `PasswordInput` component.
- [ ] Replace usage in all four auth screens.
- [ ] Snapshot test or manual screenshot in light + dark.
- [ ] QA on iOS + Android.

---

*Last Updated: 2026-05-24*
*Status: Draft - Pending Review*
