import React from 'react';
import { SearchInput, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// The component carries its own marginHorizontal: 20, so the wrapper is sized
// 40px wider than the intended field width.
const Screen = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 380,
      paddingTop: 12,
      paddingBottom: 4,
      backgroundColor: Colors.dark.background,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

/** Canonical: empty search field at the top of the Search tab. */
export const Empty = () => (
  <Screen>
    <SearchInput value="" onChangeText={() => {}} onClear={() => {}} />
  </Screen>
);

/** Filled: query present, so the clear affordance appears on the right. */
export const WithQuery = () => (
  <Screen>
    <SearchInput value="Dune: Part Two" onChangeText={() => {}} onClear={() => {}} />
  </Screen>
);

/** Placeholder axis: the field is reused across movie, TV, and people search. */
export const Placeholders = () => (
  <Screen>
    <SearchInput value="" onChangeText={() => {}} onClear={() => {}} />
    <SearchInput value="" onChangeText={() => {}} onClear={() => {}} placeholder="Search TV shows..." />
    <SearchInput value="" onChangeText={() => {}} onClear={() => {}} placeholder="Search people..." />
  </Screen>
);

/** In context: search field above its results header. */
export const AboveResults = () => (
  <Screen>
    <SearchInput value="Sinners" onChangeText={() => {}} onClear={() => {}} />
    <div style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 12 }}>
      <ThemedText style={{ ...Typography.caption.medium, color: Colors.dark.textSecondary } as any}>
        12 results
      </ThemedText>
    </div>
  </Screen>
);
