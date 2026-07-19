/**
 * RoomEmpty — first-in-the-room state, same dashed-box grammar as
 * FirstTakesEmpty. Copy is first-person ("be the first") because the viewer has
 * already cleared the watched-gate; the CTA opens the compose flow.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface RoomEmptyProps {
  onCompose: () => void;
}

export function RoomEmpty({ onCompose }: RoomEmptyProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const dashColor = effectiveTheme === 'dark' ? '#3f3f46' : '#c9c9cf';

  return (
    <View style={[styles.empty, { borderColor: dashColor }]}>
      <Text style={[styles.title, { color: colors.text }]}>Be the first take of the night</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        Every room starts empty. Tear one off — it&rsquo;s the note you scribble before anyone
        else has walked in.
      </Text>
      <Pressable
        onPress={onCompose}
        accessibilityRole="button"
        accessibilityLabel="Tear off a take"
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.ctaText}>Tear off a take</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 260,
    marginBottom: 18,
  },
  cta: {
    borderRadius: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
