import React, { useMemo } from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Particle } from '@/lib/physics-engine';
import { buildKernelPath, kernelSize } from '@/lib/kernel-generator';
import type { PopcornKernel as KernelData } from '@/lib/popcorn-service';

interface Props {
  kernel: KernelData;
  index: number;
  particles: SharedValue<Particle[]>;
}

export function PopcornKernel({ kernel, index, particles }: Props) {
  const size = useMemo(() => kernelSize(kernel.seed), [kernel.seed]);
  const path = useMemo(() => buildKernelPath(kernel.seed, size), [kernel.seed, size]);

  const transform = useDerivedValue(() => {
    const p = particles.value[index];
    if (!p) return [];
    return [{ translateX: p.x - size / 2 }, { translateY: p.y - size / 2 }];
  });

  return (
    <Group transform={transform}>
      <Path path={path} color="#F5D76E" />
      <Path path={path} style="stroke" color="#1A1208" strokeWidth={1.5} />
    </Group>
  );
}
