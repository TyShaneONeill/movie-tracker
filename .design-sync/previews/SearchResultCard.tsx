import React from 'react';
import { SearchResultCard, Colors, Spacing } from '@pocketstubs/design-system';

/**
 * The row is transparent by design — it inherits the search screen background.
 * The frame supplies that background so the near-white title reads.
 */
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      padding: Spacing.md,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
    }}
  >
    {children}
  </div>
);

export const MovieResult = () => (
  <Screen>
    <SearchResultCard
      title="Dune: Part Two"
      subtitle="2024 · Sci-Fi"
      imageUrl=""
      onPress={() => {}}
    />
  </Screen>
);

export const PersonResult = () => (
  <Screen>
    <SearchResultCard
      title="Denis Villeneuve"
      subtitle="Director · Known for Arrival"
      imageUrl=""
      onPress={() => {}}
    />
  </Screen>
);

export const ResultsList = () => (
  <Screen>
    <SearchResultCard title="The Black Phone" subtitle="2021 · Horror" imageUrl="" onPress={() => {}} />
    <SearchResultCard title="Sinners" subtitle="2025 · Thriller" imageUrl="" onPress={() => {}} />
    <SearchResultCard title="Past Lives" subtitle="2023 · Romance" imageUrl="" onPress={() => {}} />
  </Screen>
);

export const LongTitleTwoLines = () => (
  <Screen>
    <SearchResultCard
      title="Everything Everywhere All at Once"
      subtitle="2022 · Action, Adventure, Comedy"
      imageUrl=""
      onPress={() => {}}
    />
  </Screen>
);
