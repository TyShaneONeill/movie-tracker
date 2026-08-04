import React from 'react';
import { SwipeToConfirm, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// The track is 56px tall but has no intrinsic width — it measures itself via
// onLayout — so every story pins the width the sheet gives it in the app.
const SheetFooter = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 340,
      padding: 20,
      backgroundColor: Colors.dark.background,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

/** Canonical: the confirm action at the bottom of the TV watched-selection sheet. */
export const Default = () => (
  <SheetFooter>
    <SwipeToConfirm label="Swipe to mark watched" onConfirm={async () => {}} />
  </SheetFooter>
);

/** In context: sheet summary above the swipe track. */
export const InSheet = () => (
  <div
    style={{
      width: 340,
      padding: 20,
      backgroundColor: Colors.dark.card,
      borderRadius: 20,
      boxSizing: 'border-box',
    }}
  >
    <ThemedText style={{ ...Typography.body.lg, color: Colors.dark.text } as any}>
      Severance
    </ThemedText>
    <div style={{ marginTop: 4, marginBottom: 18 }}>
      <ThemedText style={{ ...Typography.body.sm, color: Colors.dark.textSecondary } as any}>
        Season 2 · 10 episodes selected
      </ThemedText>
    </div>
    <SwipeToConfirm label="Swipe to add 10 episodes" onConfirm={async () => {}} />
  </div>
);

/** Label axis: the track centers and truncates its label between puck and edge. */
export const Labels = () => (
  <SheetFooter>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SwipeToConfirm label="Swipe to confirm" onConfirm={async () => {}} />
      <SwipeToConfirm label="Swipe to mark watched" onConfirm={async () => {}} />
      <SwipeToConfirm label="Swipe to add all 62 episodes to your diary" onConfirm={async () => {}} />
    </div>
  </SheetFooter>
);

/** Disabled: whole track drops to 50% opacity and the pan gesture is off. */
export const Disabled = () => (
  <SheetFooter>
    <SwipeToConfirm label="Select at least one episode" onConfirm={async () => {}} disabled />
  </SheetFooter>
);
