/**
 * SharedTasteRail — the redesigned "Suggested" surface (contract note H,
 * "Shared taste" per Ty's inclusivity call). Today's version pins ~380pt of
 * white cards ABOVE all content; v2 is a slim horizontal rail of compact cards:
 * 30pt avatar, name, the API reason string as readable fine print (films-only
 * copy is CORRECT for phase 1 — TV-aware overlap is issue #673), and a rose
 * OUTLINE Follow chip that uses today's follow action + optimistic state.
 *
 * Placement (interleaved after the 2nd artifact group vs promoted to top) is
 * decided by the composed-items builder; this renders the rail wherever the
 * builder placed its single typed item. It is a horizontal FlatList — allowed as
 * one row inside the vertical feed FlatList (no nested VERTICAL virtualization).
 */

import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/ui/avatar';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { useFollow } from '@/hooks/use-follow';
import type { SuggestedUser } from '@/lib/suggested-users-service';

export function SharedTasteRail({ suggestions }: { suggestions: SuggestedUser[] }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  if (suggestions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.railHead, { color: colors.textTertiary }]}>SHARED TASTE</Text>
      <FlatList
        horizontal
        data={suggestions}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => <SuggestionCard user={item} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
      />
    </View>
  );
}

function SuggestionCard({ user }: { user: SuggestedUser }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const name = user.fullName || user.username;

  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${user.reason}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={styles.cardRow}>
        <Avatar size={30} userId={user.id} avatarUrl={user.avatarUrl} name={name} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={[styles.why, { color: colors.textSecondary }]} numberOfLines={2}>
        {user.reason}
      </Text>
      <FollowChip userId={user.id} username={user.username} />
    </Pressable>
  );
}

/** Rose OUTLINE follow chip — the compact rail affordance. Reuses `useFollow`
 * (today's follow action + optimistic cache), styled per the contract. */
function FollowChip({ userId, username }: { userId: string; username: string }) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { requestStatus, toggleFollow, isTogglingFollow, isLoadingStatus } = useFollow(userId, { username });

  const label =
    requestStatus === 'following' ? 'Following' : requestStatus === 'pending' ? 'Requested' : 'Follow';
  const muted = requestStatus !== 'none';

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        if (requestStatus === 'none') toggleFollow();
        else if (requestStatus === 'following') toggleFollow();
      }}
      disabled={isTogglingFollow || isLoadingStatus}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${username}`}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: muted ? colors.border : colors.tint,
          opacity: pressed || isTogglingFollow ? 0.6 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: muted ? colors.textSecondary : colors.tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    marginBottom: 2,
  },
  railHead: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginHorizontal: 2,
    marginBottom: 8,
  },
  railContent: {
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  card: {
    width: 172,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  why: {
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 6,
    minHeight: 28,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
