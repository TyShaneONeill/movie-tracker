/**
 * Attribution — the one-line ledger that pins an artifact to a person
 * (contract note B): 20pt avatar + name + verb + right-aligned relative time.
 * The person matters, but the artifact is the star, so this stays fine-print
 * gray. Tapping the name/avatar routes to the user's profile; the artifact card
 * (its sibling) owns the tap-to-detail.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Avatar } from '@/components/ui/avatar';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

interface AttributionProps {
  userId: string;
  name: string;
  avatarUrl: string | null;
  verb: string;
  timeLabel: string;
  onPressUser: () => void;
}

export function Attribution({ userId, name, avatarUrl, verb, timeLabel, onPressUser }: AttributionProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPressUser}
        accessibilityRole="button"
        accessibilityLabel={`${name}'s profile`}
        style={({ pressed }) => [styles.person, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Avatar size={20} userId={userId} avatarUrl={avatarUrl} name={name} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.verb, { color: colors.textTertiary }]} numberOfLines={1}>
          {verb}
        </Text>
      </Pressable>
      <Text style={[styles.time, { color: colors.textTertiary }]}>{timeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 2,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  verb: {
    fontSize: 12,
    flexShrink: 1,
  },
  time: {
    marginLeft: 'auto',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
});
