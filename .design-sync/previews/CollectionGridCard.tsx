import React from 'react';
import { CollectionGridCard, Colors, Spacing } from '@pocketstubs/design-system';

/**
 * Every story sits on the app background — the surface the profile grid ships on.
 * The card is flex:1 with a 2:3 aspect ratio, so the canvas is also its flex parent.
 */
const Canvas = ({ children, width }: { children: React.ReactNode; width: number }) => (
  <div
    style={{
      display: 'flex',
      gap: Spacing.sm,
      width,
      padding: Spacing.md,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
      boxSizing: 'content-box',
    }}
  >
    {children}
  </div>
);

export const Canonical = () => (
  <Canvas width={160}>
    <CollectionGridCard posterUrl="" onPress={() => {}} />
  </Canvas>
);

export const RewatchBadge = () => (
  <Canvas width={160}>
    <CollectionGridCard posterUrl="" journeyCount={3} onPress={() => {}} />
  </Canvas>
);

export const CollectionGrid = () => (
  <Canvas width={344}>
    <CollectionGridCard posterUrl="" journeyCount={1} onPress={() => {}} />
    <CollectionGridCard posterUrl="" journeyCount={2} onPress={() => {}} />
    <CollectionGridCard posterUrl="" journeyCount={12} onPress={() => {}} />
  </Canvas>
);

export const AiPoster = () => (
  <Canvas width={160}>
    <CollectionGridCard posterUrl="" isAiPoster journeyCount={2} onPress={() => {}} />
  </Canvas>
);
