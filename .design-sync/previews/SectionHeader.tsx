import React from 'react';
import { SectionHeader, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// SectionHeader draws no surface of its own — its title is `colors.text`
// (zinc 50). Every story supplies the app background it actually sits on,
// otherwise the title renders white-on-white.
const Page = ({ children }: { children: React.ReactNode }) => (
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

const PosterRail = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    {['Dune: Part Two', 'Sinners', 'The Substance'].map((title) => (
      <div
        key={title}
        style={{
          width: 92,
          height: 138,
          borderRadius: 10,
          backgroundColor: Colors.dark.card,
          border: `1px solid ${Colors.dark.border}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 8,
          boxSizing: 'border-box',
        }}
      >
        <ThemedText
          numberOfLines={2}
          style={{ ...Typography.caption.default, color: Colors.dark.textSecondary } as any}
        >
          {title}
        </ThemedText>
      </div>
    ))}
  </div>
);

/** Canonical: title only — used where the section has no overflow screen. */
export const TitleOnly = () => (
  <Page>
    <SectionHeader title="Continue Watching" />
  </Page>
);

/** Primary axis: title plus a "See All" action link. */
export const WithAction = () => (
  <Page>
    <SectionHeader title="Trending This Week" actionText="See All" onActionPress={() => {}} />
  </Page>
);

/** The real Home-tab section stack, in order. */
export const HomeSections = () => (
  <Page>
    <SectionHeader title="Continue Watching" />
    <SectionHeader title="Your Watchlist" actionText="See All" onActionPress={() => {}} />
    <SectionHeader title="Trending This Week" actionText="See All" onActionPress={() => {}} />
    <SectionHeader title="From People You Follow" actionText="See All" onActionPress={() => {}} />
    <SectionHeader title="Suggested for You" />
  </Page>
);

/** In context: header sitting above the poster rail it labels. */
export const AboveRail = () => (
  <Page>
    <SectionHeader title="Recently Stubbed" actionText="See All" onActionPress={() => {}} />
    <PosterRail />
  </Page>
);

/** Long titles hold the row without pushing the action link off the edge. */
export const LongTitle = () => (
  <Page>
    <SectionHeader title="Because You Watched Oppenheimer" actionText="See All" onActionPress={() => {}} />
  </Page>
);
