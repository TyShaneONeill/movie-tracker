/**
 * PerforatedEdge Component
 * Cinema ticket perforated edge with punch-hole notch cutouts.
 * Notches match the page background color to create the illusion of
 * holes punched through the card — works because card and background
 * have different colors in both light and dark themes.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

type ThemeColors = typeof Colors.dark;

interface PerforatedEdgeProps {
  colors: ThemeColors;
}

const NOTCH_SIZE = 20;
const NOTCH_RADIUS = NOTCH_SIZE / 2;
const DASH_COUNT = 20;

export function PerforatedEdge({ colors }: PerforatedEdgeProps) {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.notch,
          { backgroundColor: colors.background, marginLeft: -NOTCH_RADIUS },
        ]}
      />
      <View style={styles.dashedLine}>
        {Array.from({ length: DASH_COUNT }).map((_, i) => (
          <View key={i} style={[styles.dash, { backgroundColor: colors.border }]} />
        ))}
      </View>
      <View
        style={[
          styles.notch,
          { backgroundColor: colors.background, marginRight: -NOTCH_RADIUS },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  notch: {
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_RADIUS,
  },
  dashedLine: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  dash: {
    width: 8,
    height: 2,
  },
});
