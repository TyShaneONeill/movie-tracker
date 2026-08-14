import React from 'react';
import { ToggleSwitch, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

const SettingsRow = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingTop: 14,
      paddingBottom: 14,
      paddingLeft: 16,
      paddingRight: 16,
      backgroundColor: Colors.dark.card,
      borderRadius: 12,
      marginBottom: 10,
    }}
  >
    {/* Column flex is required: RN-web renders Text inline, so two stacked
        labels run together inside a plain block wrapper. */}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ThemedText style={{ ...Typography.body.smMedium, color: Colors.dark.text } as any}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText style={{ ...Typography.caption.default, color: Colors.dark.textSecondary, marginTop: 2 } as any}>
          {subtitle}
        </ThemedText>
      ) : null}
    </div>
    {children}
  </div>
);

/** Canonical: notification preferences rows from Settings. */
export const SettingsRows = () => (
  <div style={{ width: 340 }}>
    <SettingsRow title="Weekly recap" subtitle="Sunday summary of everything you watched">
      <ToggleSwitch value onValueChange={() => {}} accessibilityLabel="Weekly recap" />
    </SettingsRow>
    <SettingsRow title="Friend activity" subtitle="When someone you follow posts a take">
      <ToggleSwitch value={false} onValueChange={() => {}} accessibilityLabel="Friend activity" />
    </SettingsRow>
    <SettingsRow title="Streak reminders" subtitle="Nudge before your streak expires">
      <ToggleSwitch value onValueChange={() => {}} accessibilityLabel="Streak reminders" />
    </SettingsRow>
  </div>
);

/** Primary axis: off vs on (emerald active fill, knob travels 20px). */
export const OnAndOff = () => (
  <div style={{ width: 340, display: 'flex', alignItems: 'center', gap: 24 }}>
    <ToggleSwitch value={false} onValueChange={() => {}} accessibilityLabel="Off" />
    <ToggleSwitch value onValueChange={() => {}} accessibilityLabel="On" />
  </div>
);

/** activeColor override — rose tint, used for premium-gated feature toggles. */
export const CustomActiveColor = () => (
  <div style={{ width: 340, display: 'flex', alignItems: 'center', gap: 24 }}>
    <ToggleSwitch value onValueChange={() => {}} activeColor={Colors.dark.tint} accessibilityLabel="Rose" />
    <ToggleSwitch value onValueChange={() => {}} activeColor={Colors.dark.gold} accessibilityLabel="Gold" />
    <ToggleSwitch value onValueChange={() => {}} activeColor={Colors.dark.blue} accessibilityLabel="Blue" />
  </div>
);

/** Disabled: 50% opacity in both positions, presses ignored. */
export const Disabled = () => (
  <div style={{ width: 340 }}>
    <SettingsRow title="Private profile" subtitle="Locked while your account is under review">
      <ToggleSwitch value={false} onValueChange={() => {}} disabled accessibilityLabel="Private profile" />
    </SettingsRow>
    <SettingsRow title="Sync to Letterboxd" subtitle="Requires a linked Letterboxd account">
      <ToggleSwitch value onValueChange={() => {}} disabled accessibilityLabel="Sync to Letterboxd" />
    </SettingsRow>
  </div>
);
