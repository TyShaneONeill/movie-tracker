import React from 'react';
import { TrendingCard, Colors, BorderRadius, Spacing } from '@pocketstubs/design-system';

/** Every story sits on the app background — the surface the trending rail ships on. */
const Canvas = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      gap: 12,
      padding: Spacing.md,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
      width: 'fit-content',
    }}
  >
    {children}
  </div>
);

/**
 * TrendingCard paints its poster edge-to-edge with no placeholder of its own,
 * so the tile supplies the card-token backdrop the poster would cover.
 */
const PosterTile = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 160,
      height: 240,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
      backgroundColor: Colors.dark.card,
    }}
  >
    {children}
  </div>
);

export const Canonical = () => (
  <Canvas>
    <PosterTile>
      <TrendingCard
        title="Dune: Part Two"
        genre="Sci-Fi"
        rating="9.0"
        posterUrl=""
        onPress={() => {}}
      />
    </PosterTile>
  </Canvas>
);

export const TrendingRail = () => (
  <Canvas>
    {[
      { title: 'The Black Phone', genre: 'Horror', rating: '7.8' },
      { title: 'Past Lives', genre: 'Romance', rating: '8.4' },
      { title: 'Sinners', genre: 'Thriller', rating: '8.9' },
    ].map((m) => (
      <PosterTile key={m.title}>
        <TrendingCard {...m} posterUrl="" onPress={() => {}} />
      </PosterTile>
    ))}
  </Canvas>
);

export const LongTitleTwoLines = () => (
  <Canvas>
    <PosterTile>
      <TrendingCard
        title="Everything Everywhere All at Once"
        genre="Adventure"
        rating="8.5"
        posterUrl=""
        onPress={() => {}}
      />
    </PosterTile>
  </Canvas>
);

export const Unrated = () => (
  <Canvas>
    <PosterTile>
      <TrendingCard
        title="Hamnet"
        genre="Drama"
        rating="—"
        posterUrl=""
        onPress={() => {}}
      />
    </PosterTile>
  </Canvas>
);
