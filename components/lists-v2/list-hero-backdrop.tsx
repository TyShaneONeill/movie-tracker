/**
 * List-detail backdrop hero (contract C/D). Uses the TMDB BACKDROP (16:9) of the
 * chosen cover or the smart default — not a stretched portrait poster. A quiet
 * SET MARQUEE pill opens the cover picker. Falls back to a rose gradient when no
 * backdrop resolves (fail-safe).
 */

import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import GlassBackButton from '@/components/ui/glass-back-button';

export const LIST_HERO_HEIGHT = 230;

interface ListHeroBackdropProps {
  backdropUrl: string | null;
  title: string;
  subtitle: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  onBack: () => void;
  /** When provided, renders the SET MARQUEE pill; press opens the cover picker. */
  onSetMarquee?: () => void;
}

export function ListHeroBackdrop({
  backdropUrl,
  title,
  subtitle,
  creatorName,
  creatorAvatarUrl,
  onBack,
  onSetMarquee,
}: ListHeroBackdropProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Rose gradient base — also the fail-safe when no backdrop resolves. */}
      <LinearGradient
        colors={['#2a1a20', colors.background]}
        locations={[0, 0.95]}
        style={StyleSheet.absoluteFill}
      />
      {backdropUrl && (
        <Image
          source={{ uri: backdropUrl }}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          contentFit="cover"
          transition={220}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'transparent', colors.background]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.backButton, { top: Platform.OS === 'web' ? Spacing.md : insets.top + Spacing.xs }]}>
        <GlassBackButton onPress={onBack} />
      </View>

      {onSetMarquee && (
        <Pressable
          onPress={onSetMarquee}
          accessibilityRole="button"
          accessibilityLabel="Set the list marquee"
          style={({ pressed }) => [
            styles.marqueePill,
            { top: Platform.OS === 'web' ? Spacing.md : insets.top + Spacing.xs, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.marqueePillText}>Set marquee</Text>
        </Pressable>
      )}

      <View style={styles.content}>
        <View style={styles.creatorRow}>
          {creatorAvatarUrl ? (
            <Image source={{ uri: creatorAvatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.avatarText, { color: colors.text }]}>{creatorName[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
          )}
          <Text style={[styles.creatorText, { color: '#e4e4e7' }]}>
            Created by <Text style={styles.creatorName}>{creatorName}</Text>
          </Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: LIST_HERO_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  backdrop: {
    opacity: 0.85,
  },
  backButton: {
    position: 'absolute',
    left: Spacing.md,
    zIndex: 20,
  },
  marqueePill: {
    position: 'absolute',
    right: Spacing.md,
    zIndex: 20,
    backgroundColor: 'rgba(9,9,11,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  marqueePillText: {
    color: '#fafafa',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  content: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: Spacing.sm,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  avatarText: {
    ...Typography.caption.medium,
    fontSize: 10,
  },
  creatorText: {
    ...Typography.body.sm,
  },
  creatorName: {
    color: '#fafafa',
    fontWeight: '600',
  },
  title: {
    ...Typography.display.h2,
    color: '#fafafa',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body.sm,
    color: '#d4d4d8',
    lineHeight: 20,
  },
});
