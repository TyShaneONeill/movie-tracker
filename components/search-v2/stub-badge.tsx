/**
 * StubBadge — the signature type tag for Search v2 (Proposal 01.2).
 *
 * A bordered, uppercase, letter-spaced tag (MOVIE / TV / PERSON) with half-circle
 * notches cut into BOTH side edges at mid-height — the classic ticket-stub
 * silhouette. The notches are small circles filled with the SCREEN BACKGROUND
 * colour, positioned to overlap the left/right borders; a 1px ring in the badge
 * border colour completes the arc.
 *
 * `highlighted` (rose border + ink text) is reserved for the non-default type in
 * context — e.g. TV rows shown while the Movies scope is active in the rescue
 * state. Accent as information, never decoration.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface StubBadgeProps {
  label: string;
  highlighted?: boolean;
}

const NOTCH = 8;

export function StubBadge({ label, highlighted = false }: StubBadgeProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  // Neutral border tracks the mock's stronger hairline; highlighted uses the rose accent.
  const borderColor = highlighted ? colors.tint : colors.border;
  const textColor = highlighted ? colors.text : colors.textSecondary;
  const notch = {
    backgroundColor: colors.background,
    borderColor,
  };

  return (
    <View style={[styles.badge, { borderColor }]}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      <View style={[styles.notch, styles.notchLeft, notch]} />
      <View style={[styles.notch, styles.notchRight, notch]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  notch: {
    position: 'absolute',
    top: '50%',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    marginTop: -NOTCH / 2,
    borderWidth: 1,
  },
  notchLeft: {
    left: -NOTCH / 2,
  },
  notchRight: {
    right: -NOTCH / 2,
  },
});
