import React, { useMemo } from 'react';
import { Group, Path, Paint } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Particle } from '@/lib/physics-engine';
import { buildKernelPath, kernelSize } from '@/lib/kernel-generator';
import type { PopcornKernel as KernelData } from '@/lib/popcorn-service';

interface Props {
  kernel: KernelData;
  index: number;
  particles: SharedValue<Particle[]>;
  activeFilter: SharedValue<string | null>;
}

// Milestone kernels are gold-rimmed and slightly larger
export function MilestoneKernel({ kernel, index, particles, activeFilter }: Props) {
  const size = useMemo(() => kernelSize(kernel.seed) + 6, [kernel.seed]);
  const path = useMemo(() => buildKernelPath(kernel.seed, size), [kernel.seed, size]);

  const transform = useDerivedValue(() => {
    const p = particles.value[index];
    if (!p) return [];
    return [{ translateX: p.x - size / 2 }, { translateY: p.y - size / 2 }];
  });

  const opacity = useDerivedValue(() => {
    const filter = activeFilter.value;
    if (!filter) return 1;
    return kernel.action_type === filter ? 1 : 0.2;
  });

  return (
    <Group transform={transform} opacity={opacity}>
      {/* Fill */}
      <Path path={path}>
        <Paint color="#F5D76E" />
      </Path>
      {/* Gold rim */}
      <Path path={path} style="stroke">
        <Paint color="#FFD700" strokeWidth={2.5} />
      </Path>
    </Group>
  );
}
