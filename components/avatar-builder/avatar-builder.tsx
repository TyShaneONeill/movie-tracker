/**
 * <AvatarBuilder> — the shared Duolingo-style avatar customizer.
 *
 * Self-contained: reads/writes the current user's profile via useProfile and
 * commits with `updateAvatarSelection`. Used by:
 *   - app/settings/edit-avatar.tsx  (full screen, onDone = router.back)
 *   - onboarding profile-step        (inside a Modal, onDone = close modal)
 *
 * It is NOT routed during onboarding because the route guard would bounce a
 * not-yet-onboarded user back into the onboarding group — hence a plain
 * component that can render in a modal there and as a screen in settings.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useWideLayout } from '@/hooks/use-wide-layout';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { Avatar } from '@/components/ui/avatar';
import { ProfilePicturePicker } from '@/components/profile-picture-picker';
import {
  hapticSelection,
  hapticImpact,
  hapticNotification,
  NotificationFeedbackType,
} from '@/lib/haptics';
import { captureException } from '@/lib/sentry';
import {
  AVATAR_CATEGORIES,
  BACKGROUNDS,
  seededConfigFromId,
  randomConfig,
  type AvatarConfig,
} from '@/lib/avatar-config';

type Mode = 'preset' | 'photo' | 'initial';
type TraitKey = keyof AvatarConfig;

const MODES: { key: Mode; label: string }[] = [
  { key: 'preset', label: 'Avatar' },
  { key: 'photo', label: 'Photo' },
  { key: 'initial', label: 'Initial' },
];

export interface AvatarBuilderProps {
  /** Called after a successful save and on cancel/close. */
  onDone: () => void;
  /** When true, forces dark theme colors (used inside the dark onboarding flow). */
  forceDark?: boolean;
}

export function AvatarBuilder({ onDone, forceDark = false }: AvatarBuilderProps) {
  const { effectiveTheme } = useTheme();
  const colors = forceDark ? Colors.dark : Colors[effectiveTheme];
  const { user } = useAuth();
  const {
    profile,
    isLoading,
    updateAvatar,
    isUpdatingAvatar,
    updateAvatarSelection,
    deleteAvatar,
    isDeletingAvatar,
  } = useProfile();
  const { isWide } = useWideLayout();

  const seed = profile?.id ?? user?.id ?? 'pocketstubs';
  const displayName = profile?.full_name || profile?.username || null;

  const [mode, setMode] = useState<Mode>('preset');
  const [config, setConfig] = useState<AvatarConfig>(() => seededConfigFromId('pocketstubs'));
  const [activeCat, setActiveCat] = useState<TraitKey>(AVATAR_CATEGORIES[0].key as TraitKey);
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!profile || initialized) return;
    setMode(
      profile.avatar_type === 'photo'
        ? 'photo'
        : profile.avatar_type === 'initial'
          ? 'initial'
          : 'preset',
    );
    setConfig(
      profile.avatar_type === 'preset' && profile.avatar_config
        ? (profile.avatar_config as AvatarConfig)
        : seededConfigFromId(profile.id),
    );
    setInitialized(true);
  }, [profile, initialized]);

  const activeCategory = useMemo(
    () => AVATAR_CATEGORIES.find((c) => c.key === activeCat) ?? AVATAR_CATEGORIES[0],
    [activeCat],
  );

  const setTrait = (key: TraitKey, value: string) => {
    hapticSelection();
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const onRandomize = () => {
    hapticImpact();
    setConfig(randomConfig());
  };

  const handlePhotoSelected = async (uri: string, mimeType?: string) => {
    try {
      await updateAvatar({ imageUri: uri, mimeType });
      Toast.show({ type: 'success', text1: 'Photo uploaded', visibilityTime: 1500 });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'avatar-builder-photo-upload',
      });
      Alert.alert('Upload Failed', 'Could not upload your photo. Please try again.');
    }
  };

  // Category selector: wrap into rows on wide/desktop (all visible, no fiddly
  // horizontal scroll), keep the compact horizontal swipe on phones.
  const renderCategoryTabs = () => {
    const chips = AVATAR_CATEGORIES.map((cat) => {
      const selected = cat.key === activeCat;
      return (
        <Pressable
          key={cat.key}
          onPress={() => {
            hapticSelection();
            setActiveCat(cat.key as TraitKey);
          }}
          style={[styles.catTab, { backgroundColor: selected ? colors.tint : colors.card }]}
        >
          <Text style={[styles.catTabLabel, { color: selected ? '#fff' : colors.textSecondary }]}>
            {cat.label}
          </Text>
        </Pressable>
      );
    });
    return isWide ? (
      <View style={styles.catTabsWrap}>{chips}</View>
    ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catTabsScroll}
        contentContainerStyle={styles.catTabs}
      >
        {chips}
      </ScrollView>
    );
  };

  const handleRemovePhoto = async () => {
    hapticImpact();
    try {
      await deleteAvatar(); // removes the file + clears profiles.avatar_url
      // Fall back per the chain: saved avatar if one exists, otherwise initial.
      const hasConfig = !!profile?.avatar_config;
      await updateAvatarSelection({
        avatarType: hasConfig ? 'preset' : 'auto',
        avatarConfig: hasConfig ? (profile?.avatar_config as AvatarConfig) : null,
      });
      setMode(hasConfig ? 'preset' : 'initial');
      hapticNotification(NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Photo removed', visibilityTime: 1500 });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'avatar-builder-remove-photo',
      });
      Alert.alert('Could not remove photo', 'Please try again.');
    }
  };

  const handleSave = async () => {
    hapticImpact();
    setIsSaving(true);
    try {
      if (mode === 'preset') {
        await updateAvatarSelection({ avatarType: 'preset', avatarConfig: config });
      } else if (mode === 'initial') {
        await updateAvatarSelection({
          avatarType: 'initial',
          avatarConfig: { backgroundColor: config.backgroundColor },
        });
      } else {
        if (!profile?.avatar_url) {
          Alert.alert('No photo yet', 'Tap the avatar to add a photo, or pick an Avatar / Initial.');
          setIsSaving(false);
          return;
        }
        await updateAvatarSelection({ avatarType: 'photo', avatarConfig: null });
      }
      hapticNotification(NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Avatar updated', visibilityTime: 2000 });
      onDone();
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        context: 'avatar-builder-save',
      });
      Alert.alert('Save Failed', 'Could not update your avatar. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onDone}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={[styles.headerAction, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[Typography.display.h4, { color: colors.text }]}>Edit Avatar</Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed || isSaving ? 0.5 : 1 })}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Text style={[styles.headerAction, { color: colors.tint, fontWeight: '600' }]}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.scrollFrame} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Live preview */}
        <View style={styles.previewWrap}>
          <Avatar
            size={140}
            userId={seed}
            avatarUrl={profile?.avatar_url}
            name={displayName}
            avatarType={mode}
            config={config}
          />
        </View>

        {/* Mode switch */}
        <View style={[styles.segment, { backgroundColor: colors.card }]}>
          {MODES.map((m) => {
            const selected = mode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  hapticSelection();
                  setMode(m.key);
                }}
                style={[styles.segmentItem, selected && { backgroundColor: colors.tint }]}
              >
                <Text style={[styles.segmentLabel, { color: selected ? '#fff' : colors.textSecondary }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* AVATAR (preset) builder */}
        {mode === 'preset' && (
          <>
            {renderCategoryTabs()}

            <View style={styles.optionGrid}>
              {activeCategory.options.map((opt) => {
                const selected = config[activeCat] === opt.id;
                if (activeCategory.kind === 'color') {
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => setTrait(activeCat, opt.id)}
                      style={[
                        styles.swatch,
                        { backgroundColor: `#${opt.id}` },
                        selected && { borderColor: colors.tint, borderWidth: 3 },
                      ]}
                    />
                  );
                }
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setTrait(activeCat, opt.id)}
                    style={[
                      styles.styleOption,
                      { borderColor: selected ? colors.tint : 'transparent', backgroundColor: colors.card },
                    ]}
                  >
                    <Avatar size={52} userId={seed} avatarType="preset" config={{ ...config, [activeCat]: opt.id }} />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={onRandomize}
              style={({ pressed }) => [styles.randomize, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.randomizeLabel, { color: colors.text }]}>🎲  Randomize</Text>
            </Pressable>
          </>
        )}

        {/* PHOTO */}
        {mode === 'photo' && (
          <View style={styles.modeBody}>
            <ProfilePicturePicker
              avatarUrl={profile?.avatar_url}
              size={120}
              isLoading={isUpdatingAvatar}
              onImageSelected={handlePhotoSelected}
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Tap to upload a photo, then Save to use it.
            </Text>
            {profile?.avatar_url ? (
              <Pressable
                onPress={handleRemovePhoto}
                disabled={isDeletingAvatar}
                style={({ pressed }) => [styles.removeBtn, { opacity: pressed || isDeletingAvatar ? 0.5 : 1 }]}
              >
                <Ionicons name="trash-outline" size={15} color={colors.error} />
                <Text style={[styles.removeLabel, { color: colors.error }]}>Remove photo</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* INITIAL */}
        {mode === 'initial' && (
          <View style={styles.modeBody}>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Pick a background color for your initial.
            </Text>
            <View style={styles.optionGrid}>
              {BACKGROUNDS.map((bg) => {
                const selected = config.backgroundColor === bg.id;
                return (
                  <Pressable
                    key={bg.id}
                    onPress={() => setTrait('backgroundColor', bg.id)}
                    style={[
                      styles.swatch,
                      { backgroundColor: `#${bg.id}` },
                      selected && { borderColor: colors.tint, borderWidth: 3 },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Header + scroll frame share the same centered column cap so Cancel/Save
  // align with the body on desktop (real Views — maxWidth on a ScrollView's
  // contentContainerStyle does NOT constrain children on web). No-op on phones.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Platform.OS === 'web' ? Spacing.md : Spacing.sm,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  headerAction: { fontSize: 16 },
  scrollFrame: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  scrollContent: { paddingBottom: 100, alignItems: 'center' },
  previewWrap: { paddingVertical: Spacing.lg, alignItems: 'center' },
  segment: { flexDirection: 'row', borderRadius: BorderRadius.full, padding: 4, marginBottom: Spacing.lg },
  segmentItem: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.full },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  catTabsScroll: { width: '100%', flexGrow: 0 },
  catTabs: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  catTabsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  catTab: { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
  catTabLabel: { fontSize: 13, fontWeight: '600' },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  swatch: { width: 48, height: 48, borderRadius: 24, borderColor: 'transparent', borderWidth: 3 },
  styleOption: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  randomize: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  randomizeLabel: { fontSize: 15, fontWeight: '600' },
  modeBody: { alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.sm },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  removeLabel: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
