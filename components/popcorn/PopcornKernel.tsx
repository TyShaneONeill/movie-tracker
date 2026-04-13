import React, { useMemo } from 'react';
import { Group, Path, Paint } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Particle } from '@/lib/physics-engine';
import { buildKernelPath, kernelSize } from '@/lib/kernel-generator';
import { POPCORN_ACTION_TYPES } from '@/constants/popcorn-types';
import type { PopcornKernel as KernelData } from '@/lib/popcorn-service';

interface Props {
  kernel: KernelData;
  index: number;
  particles: SharedValue<Particle[]>;
  activeFilter: SharedValue<string | null>;
}

export function PopcornKernel({ kernel, index, particles, activeFilter }: Props) {
  const size = useMemo(() => kernelSize(kernel.seed), [kernel.seed]);
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

  const baseColor = '#F5D76E';
  const filterColor =
    POPCORN_ACTION_TYPES[kernel.action_type as keyof typeof POPCORN_ACTION_TYPES]?.color ?? baseColor;

  const tintOpacity = useDerivedValue(() =>
    activeFilter.value === kernel.action_type ? 0.55 : 0
  );

  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path}>
        <Paint color={baseColor} />
      </Path>
      <Path path={path}>
        <Paint color={filterColor} opacity={tintOpacity} />
      </Path>
    </Group>
  );
}
