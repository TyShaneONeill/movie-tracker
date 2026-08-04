import React from 'react';
import { ProfileIdentitySkeleton, ThemedText, Colors, Typography } from '@pocketstubs/design-system';

// The skeleton sizes itself from its children (80px avatar + two lines) and
// carries no background of its own, so every story supplies an explicit
// canvas and height — otherwise the pulsing blocks have nothing to read against.
const Canvas = ({
  children,
  background,
}: {
  children: React.ReactNode;
  background: string;
}) => (
  <div
    style={{
      width: 340,
      minHeight: 190,
      paddingTop: 24,
      paddingBottom: 24,
      backgroundColor: background,
      borderRadius: 16,
      boxSizing: 'border-box',
    }}
  >
    {children}
  </div>
);

/** Canonical: profile header loading state, exactly as the Profile tab renders it. */
export const Loading = () => (
  <Canvas background={Colors.dark.background}>
    <ProfileIdentitySkeleton shimmerColor={Colors.dark.backgroundSecondary} />
  </Canvas>
);

/** Higher-contrast shimmer for card surfaces (zinc 800 blocks on the page background). */
export const OnCardSurface = () => (
  <Canvas background={Colors.dark.background}>
    <ProfileIdentitySkeleton shimmerColor={Colors.dark.card} />
  </Canvas>
);

/** shimmerColor axis: the three surface tones the skeleton is used against. */
export const ShimmerTones = () => (
  <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Canvas background={Colors.dark.background}>
      <ProfileIdentitySkeleton shimmerColor={Colors.dark.backgroundSecondary} />
    </Canvas>
    <Canvas background={Colors.dark.background}>
      <ProfileIdentitySkeleton shimmerColor={Colors.dark.card} />
    </Canvas>
    <Canvas background={Colors.dark.backgroundSecondary}>
      <ProfileIdentitySkeleton shimmerColor="#3f3f46" />
    </Canvas>
  </div>
);

/** In context: skeleton standing in for the identity block above the stat row. */
export const AboveStatRow = () => (
  <Canvas background={Colors.dark.background}>
    <ProfileIdentitySkeleton shimmerColor={Colors.dark.card} />
    <div
      style={{
        marginTop: 20,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}
    >
      {['Stubs', 'Following', 'Followers'].map((label) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div
            style={{
              height: 18,
              width: 32,
              borderRadius: 4,
              backgroundColor: Colors.dark.card,
              margin: '0 auto 4px',
            }}
          />
          <ThemedText style={{ ...Typography.caption.default, color: Colors.dark.textSecondary } as any}>
            {label}
          </ThemedText>
        </div>
      ))}
    </div>
  </Canvas>
);
