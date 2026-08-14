import React from 'react';
import { PerforatedEdge, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// The notch cutouts are painted in `colors.background`, so the illusion of
// punched holes only reads when the surrounding page matches that color and
// the card behind the edge does not. Every story therefore renders a real
// two-stub card on a page-colored canvas.
const Page = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 340, padding: 20, backgroundColor: Colors.dark.background, boxSizing: 'border-box' }}>
    {children}
  </div>
);

const Stub = ({
  children,
  position,
  height,
}: {
  children?: React.ReactNode;
  position: 'top' | 'bottom';
  height: number;
}) => (
  <div
    style={{
      height,
      backgroundColor: Colors.dark.card,
      borderTopLeftRadius: position === 'top' ? 16 : 0,
      borderTopRightRadius: position === 'top' ? 16 : 0,
      borderBottomLeftRadius: position === 'bottom' ? 16 : 0,
      borderBottomRightRadius: position === 'bottom' ? 16 : 0,
      padding: 16,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

/** Canonical: the tear line between the two halves of a streak punch card. */
export const StreakPunchCard = () => (
  <Page>
    <Stub position="top" height={96}>
      <ThemedText style={{ ...Typography.display.h2, color: Colors.dark.tint } as any}>12</ThemedText>
      <ThemedText style={{ ...Typography.body.sm, color: Colors.dark.textSecondary } as any}>
        days in a row
      </ThemedText>
    </Stub>
    <PerforatedEdge colors={Colors.dark} />
    <Stub position="bottom" height={72}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textTertiary } as any}>
        MON TUE WED THU FRI SAT SUN
      </ThemedText>
    </Stub>
  </Page>
);

/** dashColor override — the brighter tear line used on the Journey hero. */
export const JourneyHeroEdge = () => (
  <Page>
    <Stub position="top" height={110}>
      <ThemedText style={{ ...Typography.body.lg, color: Colors.dark.text } as any}>
        Dune: Part Two
      </ThemedText>
      <ThemedText style={{ ...Typography.body.sm, color: Colors.dark.textSecondary } as any}>
        AMC Providence Place 16 · IMAX
      </ThemedText>
    </Stub>
    <PerforatedEdge colors={Colors.dark} dashColor="rgba(255, 255, 255, 0.5)" />
    <Stub position="bottom" height={80}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textTertiary } as any}>
        SEAT F12 · 7:45 PM · MAR 14, 2026
      </ThemedText>
    </Stub>
  </Page>
);

/** dashColor axis: default border, rose tint, and gold. */
export const DashColors = () => (
  <Page>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ backgroundColor: Colors.dark.card, height: 44, borderRadius: 12 }} />
      <PerforatedEdge colors={Colors.dark} />
      <div style={{ backgroundColor: Colors.dark.card, height: 44, borderRadius: 12 }} />
      <PerforatedEdge colors={Colors.dark} dashColor={Colors.dark.tint} />
      <div style={{ backgroundColor: Colors.dark.card, height: 44, borderRadius: 12 }} />
      <PerforatedEdge colors={Colors.dark} dashColor={Colors.dark.gold} />
      <div style={{ backgroundColor: Colors.dark.card, height: 44, borderRadius: 12 }} />
    </div>
  </Page>
);

/**
 * On an elevated surface the caller passes a colors object whose `background`
 * matches the surface behind the card, so the notches still read as holes.
 */
export const OnElevatedSurface = () => (
  <div style={{ width: 340, padding: 20, backgroundColor: Colors.dark.backgroundSecondary, boxSizing: 'border-box' }}>
    <Stub position="top" height={72}>
      <ThemedText style={{ ...Typography.body.smMedium, color: Colors.dark.text } as any}>
        Double Feature
      </ThemedText>
    </Stub>
    <PerforatedEdge colors={{ ...Colors.dark, background: Colors.dark.backgroundSecondary }} />
    <Stub position="bottom" height={64}>
      <ThemedText style={{ ...Typography.caption.default, color: Colors.dark.textSecondary } as any}>
        2 stubs · Saturday
      </ThemedText>
    </Stub>
  </div>
);
