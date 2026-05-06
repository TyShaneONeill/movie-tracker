import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PhysicsConfig } from '@/lib/physics-engine';

interface Props {
  config: PhysicsConfig;
  onChange: (next: PhysicsConfig) => void;
}

const TUNABLES: { key: keyof PhysicsConfig; min: number; max: number; step: number }[] = [
  { key: 'gravity', min: 0, max: 40, step: 0.1 },
  { key: 'damping', min: 0.5, max: 1.0, step: 0.005 },
  { key: 'restitution', min: 0, max: 1.0, step: 0.01 },
  { key: 'airDrag', min: 0, max: 0.5, step: 0.005 },
  { key: 'kernelFriction', min: 0, max: 1.0, step: 0.005 },
  { key: 'jumpImpulse', min: 0, max: 80, step: 0.5 },
  { key: 'jumpThreshold', min: 0.3, max: 3.0, step: 0.05 },
  { key: 'maxSpeed', min: 0.5, max: 30, step: 0.1 },
  { key: 'angularDamping', min: 0.5, max: 1.0, step: 0.005 },
  { key: 'angularKickWall', min: 0, max: 1.0, step: 0.01 },
  { key: 'angularKickCollision', min: 0, max: 1.0, step: 0.01 },
];

export function DevPhysicsTuner({ config, onChange }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { bottom: insets.bottom + 70 }]}>
      <Text style={styles.title}>Physics tuner (DEV)</Text>
      {TUNABLES.map(({ key, min, max, step }) => (
        <View key={key} style={styles.row}>
          <Text style={styles.label}>
            {key}: {(config[key] as number).toFixed(2)}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={min}
            maximumValue={max}
            step={step}
            value={config[key] as number}
            onValueChange={(v) => onChange({ ...config, [key]: v })}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 8,
    borderRadius: 8,
  },
  title: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  row: { marginBottom: 4 },
  label: { color: '#fff', fontSize: 11 },
  slider: { width: '100%', height: 24 },
});
