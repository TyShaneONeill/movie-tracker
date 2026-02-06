import { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ProfilePicturePicker } from '@/components/profile-picture-picker';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, updateProfileAvatarUrl } from '@/lib/avatar-service';

export default function ProfileSetupScreen() {
  const { effectiveTheme } = useTheme();
  const { user } = useAuth();
  const { completeOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const colors = Colors[effectiveTheme];

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleImageSelected = async (imageUri: string, mimeType?: string) => {
    if (!user) return;

    setIsUploadingAvatar(true);
    setError(null);

    try {
      const result = await uploadAvatar(user.id, imageUri, mimeType);

      if (result.success && result.url) {
        setAvatarUrl(result.url);
        // Update profile immediately so it persists
        await updateProfileAvatarUrl(user.id, result.url);
      } else {
        setError(result.error || 'Failed to upload image');
      }
    } catch (err) {
      // TODO: Replace with Sentry error tracking
      setError('Failed to upload image');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleComplete = async () => {
    if (!user) {
      setError('You must be logged in to continue');
      return;
    }

    // Validate display name is required
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    // Validate username if provided
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3-20 characters (letters, numbers, underscores)');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const updates: Record<string, string | null> = {};

      if (displayName.trim()) {
        updates.full_name = displayName.trim();
      }

      if (username.trim()) {
        // Check if username is taken
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim().toLowerCase())
          .neq('id', user.id)
          .single();

        if (existing) {
          setError('This username is already taken');
          setIsSubmitting(false);
          return;
        }

        updates.username = username.trim().toLowerCase();
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await (supabase
          .from('profiles') as ReturnType<typeof supabase.from>)
          .update(updates)
          .eq('id', user.id);

        if (updateError) {
          // TODO: Replace with Sentry error tracking
          setError('Failed to update profile. Please try again.');
          setIsSubmitting(false);
          return;
        }

        // Invalidate the profile cache so the Profile screen shows fresh data
        await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      }

      Toast.show({
        type: 'success',
        text1: 'Profile saved',
        visibilityTime: 2000,
      });
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (err) {
      // TODO: Replace with Sentry error tracking
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View style={styles.titleContainer}>
            <ThemedText style={[styles.title, { color: colors.text }]}>
              Set Up Your Profile
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              Tell us a bit about yourself
            </ThemedText>
          </View>

          {/* Avatar Picker */}
          <View style={styles.avatarSection}>
            <ProfilePicturePicker
              avatarUrl={avatarUrl}
              size={120}
              isLoading={isUploadingAvatar}
              onImageSelected={handleImageSelected}
            />
            <ThemedText style={[styles.avatarHint, { color: colors.textSecondary }]}>
              Tap to add a profile photo
            </ThemedText>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error && (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: colors.text }]}>
                Display Name
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="How should we call you?"
                placeholderTextColor={colors.textSecondary}
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={50}
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, { color: colors.text }]}>
                Username
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="@username"
                placeholderTextColor={colors.textSecondary}
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                editable={!isSubmitting}
              />
              <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
                3-20 characters, letters, numbers, and underscores only
              </ThemedText>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={handleComplete}
            disabled={isSubmitting || isUploadingAvatar}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.primaryButtonText}>
                  {displayName || username || avatarUrl ? 'Save & Continue' : 'Continue'}
                </ThemedText>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.display.h2,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body.base,
    textAlign: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatarHint: {
    ...Typography.body.sm,
    marginTop: Spacing.sm,
  },
  form: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    ...Typography.body.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.body.sm,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  hint: {
    ...Typography.body.xs,
    marginTop: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 56,
    borderRadius: BorderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
