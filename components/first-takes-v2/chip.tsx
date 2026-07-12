/**
 * Chip — the 9px uppercase hairline-outline tag shared by the profile v2 tabs
 * (First Takes + Reviews). Rose outline is reserved for the one accented state
 * (Rewatch). Extracted verbatim from the original TakeChips styling so both
 * tabs render one chip system.
 */

import { View, Text, StyleSheet } from 'react-native';

interface ChipProps {
  label: string;
  /** Text color. */
  color: string;
  /** Border color. */
  border: string;
}

export function Chip({ label, color, border }: ChipProps) {
  return (
    <View style={[styles.chip, { borderColor: border }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  chipText: {
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
