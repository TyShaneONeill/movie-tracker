import { useState } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ProfilePicturePicker } from '@/components/profile-picture-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useAuth } from '@/hooks/use-auth';
import { useUsernameValidation } from '@/hooks/use-username-validation';
import { uploadAvatar, updateProfileAvatarUrl } from '@/lib/avatar-service';
import { captureException } from '@/lib/sentry';
import { StepLayout } from '@/components/onboarding/v2/shared/step-layout';
import { CTAButton } from '@/components/onboarding/v2/shared/cta-button';
import { useOnboardingV2 } from '@/components/onboarding/v2/onboarding-v2-context';
import { MONO_FONT } from '@/components/onboarding/v2/shared/mono';
import type { StepProps } from '@/components/onboarding/v2/types';

export function ProfileStep({ onNext }: StepProps) {
  const colors = Colors.dark;
  const { user } = useAuth();
  const { data, update } = useOnboardingV2();
  const [isUploading, setIsUploading] = useState(false);

  const usernameValidation = useUsernameValidation(data.handle, user?.id);
  const nameValid = data.name.trim().length > 0;
  const usernameValid = usernameValidation.status === 'available';
  const canContinue = nameValid && usernameValid && !isUploading;

  const initial = data.name.trim().charAt(0).toUpperCase();

  const handleImageSelected = async (imageUri: string, mimeType?: string) => {
    if (!user) return;
    setIsUploading(true);
    try {
      const result = await uploadAvatar(user.id, imageUri, mimeType);
      if (result.success && result.url) {
        update({ avatarUrl: result.url });
        await updateProfileAvatarUrl(user.id, result.url);
      }
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), { context: 'onboarding-v2-avatar' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StepLayout
        title="Make it yours"
        subtitle="This is how you'll show up across PocketStubs."
        footer={<CTAButton label="Continue" onPress={onNext} disabled={!canContinue} />}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <ProfilePicturePicker
            avatarUrl={data.avatarUrl}
            size={96}
            isLoading={isUploading}
            onImageSelected={handleImageSelected}
            initial={data.name}
            hideCameraBadge
            dashedEmptyRing
          />
          <ThemedText style={[styles.caption, { color: colors.textTertiary }]}>
            Tap your photo to add one
          </ThemedText>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: colors.text }]}>Name</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            value={data.name}
            onChangeText={(t) => update({ name: t })}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={50}
          />
          <ThemedText style={[styles.hint, { color: colors.textTertiary }]}>
            Shown on your profile. Use your real name or an alias.
          </ThemedText>
        </View>

        {/* Username */}
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: colors.text }]}>Username</ThemedText>
          <View style={[styles.usernameWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={[styles.at, { color: colors.textTertiary }]}>@</ThemedText>
            <TextInput
              style={[styles.usernameInput, { color: colors.text }]}
              placeholder="username"
              placeholderTextColor={colors.textTertiary}
              value={data.handle}
              onChangeText={(t) => update({ handle: t.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            {usernameValidation.status === 'checking' && <ActivityIndicator size="small" color={colors.textTertiary} />}
            {usernameValidation.status === 'available' && <Ionicons name="checkmark-circle" size={18} color={colors.accentSecondary} />}
            {(usernameValidation.status === 'taken' || usernameValidation.status === 'invalid') && (
              <Ionicons name="close-circle" size={18} color={colors.error} />
            )}
          </View>
          <ThemedText
            style={[
              styles.hint,
              { color: usernameValidation.status === 'taken' || usernameValidation.status === 'invalid' ? colors.error : colors.textTertiary },
            ]}
          >
            {usernameValidation.status === 'taken'
              ? 'That handle is taken — try another.'
              : usernameValidation.status === 'invalid'
                ? usernameValidation.error
                : 'Your unique @handle — appears on your reviews, comments, and profile link.'}
          </ThemedText>
        </View>

        {/* Live "How you'll appear" preview */}
        <View style={[styles.preview, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <ThemedText style={[styles.previewLabel, { color: colors.textTertiary }]}>HOW YOU&apos;LL APPEAR</ThemedText>
          <View style={styles.previewRow}>
            <View style={[styles.previewAvatar, { backgroundColor: colors.tint }]}>
              <ThemedText style={styles.previewInitial}>{initial || '?'}</ThemedText>
            </View>
            <View style={styles.flex}>
              <View style={styles.previewNameRow}>
                <ThemedText style={[styles.previewName, { color: colors.text }]}>
                  {data.name.trim() || 'Your name'}
                </ThemedText>
                <ThemedText style={[styles.previewHandle, { color: colors.tint }]}>
                  @{data.handle || 'username'}
                </ThemedText>
              </View>
              <ThemedText style={[styles.previewComment, { color: colors.textSecondary }]}>
                Loved every minute of this one.
              </ThemedText>
            </View>
          </View>

          {/* Legend — kills the Name-vs-Username confusion */}
          <View style={[styles.legend, { borderTopColor: colors.border }]}>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colors.text }]} />
              <ThemedText style={[styles.legendText, { color: colors.textTertiary }]}>= your name</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colors.tint }]} />
              <ThemedText style={[styles.legendText, { color: colors.textTertiary }]}>= your @handle</ThemedText>
            </View>
          </View>
        </View>

        {/* Letterboxd nudge */}
        <View style={[styles.nudge, { borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
          <ThemedText style={[styles.nudgeText, { color: colors.textTertiary }]}>
            Coming from Letterboxd? Find it later under Settings → Account → Import.
          </ThemedText>
        </View>
      </StepLayout>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  avatarSection: { alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.sm },
  caption: { ...Typography.body.sm },
  field: { marginBottom: Spacing.lg },
  label: { ...Typography.body.smMedium, marginBottom: Spacing.xs },
  input: { height: 52, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  usernameWrap: { flexDirection: 'row', alignItems: 'center', height: 52, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, gap: 4 },
  at: { fontSize: 16 },
  usernameInput: { flex: 1, fontSize: 16 },
  hint: { ...Typography.body.xs, marginTop: Spacing.xs },
  preview: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  previewLabel: { fontFamily: MONO_FONT, fontSize: 10, letterSpacing: 2 },
  previewRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  previewAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  previewInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  previewNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  previewName: { ...Typography.body.baseMedium },
  previewHandle: { ...Typography.body.sm },
  previewComment: { ...Typography.body.sm, marginTop: 2 },
  legend: { flexDirection: 'row', gap: Spacing.lg, borderTopWidth: 1, paddingTop: Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { ...Typography.body.xs },
  nudge: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed' },
  nudgeText: { ...Typography.body.xs, flex: 1, lineHeight: 18 },
});
