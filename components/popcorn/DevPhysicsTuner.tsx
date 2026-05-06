import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
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
  { key: 'sleepThreshold', min: 0.01, max: 0.5, step: 0.005 },
  { key: 'framesToFreeze', min: 1, max: 60, step: 1 },
  { key: 'personalityStrength', min: 0, max: 3, step: 0.05 },
  { key: 'massResponseStrength', min: 0, max: 3, step: 0.05 },
  { key: 'wallAbsorption', min: 0, max: 1, step: 0.01 },
  { key: 'solverIterations', min: 1, max: 5, step: 1 },
  { key: 'tiltDeadband', min: 0, max: 0.5, step: 0.005 },
];

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function DevPhysicsTuner({ config, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState(true);
  const [activeKey, setActiveKey] = useState<keyof PhysicsConfig | null>(null);

  // When expanded, cap height at ~45% of screen so the bag stays visible above.
  const maxScrollHeight = Math.floor(SCREEN_HEIGHT * 0.45);

  return (
    <View style={[styles.container, { bottom: insets.bottom + 70 }]}>
      {/* Header bar — always visible, tappable to toggle */}
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.title}>
          {collapsed ? '▸' : '▾'} Physics tuner (DEV)
          {activeKey && collapsed ? `  ·  ${activeKey}: ${(config[activeKey] as number).toFixed(2)}` : ''}
        </Text>
      </Pressable>

      {!collapsed && (
        <ScrollView
          style={{ maxHeight: maxScrollHeight }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
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
                onValueChange={(v) => {
                  setActiveKey(key);
                  onChange({ ...config, [key]: v });
                }}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    // More translucent so the bag is visible through the panel while tuning.
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 8,
    borderRadius: 8,
  },
  header: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerPressed: {
    opacity: 0.7,
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scrollContent: {
    paddingTop: 4,
  },
  row: { marginBottom: 4 },
  label: { color: '#fff', fontSize: 11 },
  slider: { width: '100%', height: 24 },
});
