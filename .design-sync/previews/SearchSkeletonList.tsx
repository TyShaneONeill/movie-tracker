import React from 'react';
import { SearchSkeletonList, Colors, Spacing } from '@pocketstubs/design-system';

/**
 * The skeleton draws nothing on its own — every surface is painted from the two
 * colour props, so the stories pass the dark card/shimmer tokens the search
 * screen passes in production.
 */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      paddingTop: Spacing.sm,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
    }}
  >
    {children}
  </div>
);

export const SearchLoading = () => (
  <Frame>
    <SearchSkeletonList cardColor={Colors.dark.card} shimmerColor="#3f3f46" />
  </Frame>
);

export const LowContrastShimmer = () => (
  <Frame>
    <SearchSkeletonList cardColor={Colors.dark.backgroundSecondary} shimmerColor="#27272a" />
  </Frame>
);
