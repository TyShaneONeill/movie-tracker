import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/lib/theme-context';
import { useProfile } from '@/hooks/use-profile';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { ProfilePicturePicker } from '@/components/profile-picture-picker';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

interface FormData {
  fullName: string;
  username: string;
  bio: string;
}

interface FormErrors {
  fullName?: string;
  username?: string;
  bio?: string;
}

// Validation rules
const VALIDATION = {
  username: {
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-z0-9_]+$/,
  },
  fullName: {
    minLength: 1,
    maxLength: 50,
  },
  bio: {
    maxLength: 150,
  },
};

function validateForm(data: FormData): FormErrors {
  const errors: FormErrors = {};

  // Username validation
  if (data.username) {
    if (data.username.length < VALIDATION.username.minLength) {
      errors.username = `Username must be at least ${VALIDATION.username.minLength} characters`;
    } else if (data.username.length > VALIDATION.username.maxLength) {
      errors.username = `Username must be less than ${VALIDATION.username.maxLength} characters`;
    } else if (!VALIDATION.username.pattern.test(data.username)) {
      errors.username = 'Username can only contain lowercase letters, numbers, and underscores';
    }
  }

  // Full name validation
  if (data.fullName && data.fullName.length > VALIDATION.fullName.maxLength) {
    errors.fullName = `Name must be less than ${VALIDATION.fullName.maxLength} characters`;
  }

  // Bio validation
  if (data.bio && data.bio.length > VALIDATION.bio.maxLength) {
    errors.bio = `Bio must be less than ${VALIDATION.bio.maxLength} characters`;
  }

  return errors;
}

export default function EditProfileScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { profile, isLoading, updateAvatar, isUpdatingAvatar, updateProfile } = useProfile();

  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    username: '',
    bio: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Populate form with existing profile data
  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.full_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
      });
    }
  }, [profile]);

  const handleChange = (field: keyof FormData, value: string) => {
    // For username, force lowercase and remove invalid characters
    const processedValue = field === 'username'
      ? value.toLowerCase().replace(/[^a-z0-9_]/g, '')
      : value;

    setFormData(prev => ({ ...prev, [field]: processedValue }));
    setHasChanges(true);

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSave = async () => {
    // Validate form
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        fullName: formData.fullName || undefined,
        username: formData.username || undefined,
        bio: formData.bio || undefined,
      });

      // Navigate back after save
      router.back();
    } catch (error) {
      // TODO: Replace with Sentry error tracking
      // TODO: Show error toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageSelected = async (uri: string, mimeType?: string) => {
    try {
      await updateAvatar({ imageUri: uri, mimeType });
    } catch (error) {
      // TODO: Replace with Sentry error tracking
      Alert.alert('Upload Failed', 'Could not upload profile photo. Please try again.');
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
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Edit Profile</Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving || !hasChanges}
            style={({ pressed }) => ({ opacity: (pressed || isSaving || !hasChanges) ? 0.5 : 1 })}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Text style={[styles.saveButton, { color: colors.tint }]}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Picture */}
          <View style={styles.avatarSection}>
            <ProfilePicturePicker
              avatarUrl={profile?.avatar_url}
              size={120}
              isLoading={isUpdatingAvatar}
              onImageSelected={handleImageSelected}
            />
            <Text style={[styles.changePhotoText, { color: colors.tint }]}>
              Tap to change photo
            </Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: errors.fullName ? colors.tint : 'transparent',
                  }
                ]}
                value={formData.fullName}
                onChangeText={(value) => handleChange('fullName', value)}
                placeholder="Your name"
                placeholderTextColor={colors.textTertiary}
                maxLength={VALIDATION.fullName.maxLength}
                autoCapitalize="words"
              />
              {errors.fullName && (
                <Text style={[styles.errorText, { color: colors.tint }]}>{errors.fullName}</Text>
              )}
            </View>

            {/* Username */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Username</Text>
              <View style={styles.usernameContainer}>
                <Text style={[styles.usernamePrefix, { color: colors.textSecondary }]}>@</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.usernameInput,
                    {
                      backgroundColor: colors.card,
                      color: colors.text,
                      borderColor: errors.username ? colors.tint : 'transparent',
                    }
                  ]}
                  value={formData.username}
                  onChangeText={(value) => handleChange('username', value)}
                  placeholder="username"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={VALIDATION.username.maxLength}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.username ? (
                <Text style={[styles.errorText, { color: colors.tint }]}>{errors.username}</Text>
              ) : (
                <Text style={[styles.hintText, { color: colors.textTertiary }]}>
                  {formData.username.length}/{VALIDATION.username.maxLength} characters
                </Text>
              )}
            </View>

            {/* Bio */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.bioInput,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: errors.bio ? colors.tint : 'transparent',
                  }
                ]}
                value={formData.bio}
                onChangeText={(value) => handleChange('bio', value)}
                placeholder="Tell us about yourself..."
                placeholderTextColor={colors.textTertiary}
                maxLength={VALIDATION.bio.maxLength}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {errors.bio ? (
                <Text style={[styles.errorText, { color: colors.tint }]}>{errors.bio}</Text>
              ) : (
                <Text style={[styles.hintText, { color: colors.textTertiary }]}>
                  {formData.bio.length}/{VALIDATION.bio.maxLength} characters
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  changePhotoText: {
    marginTop: Spacing.sm,
    fontSize: 14,
    fontWeight: '500',
  },
  formSection: {
    paddingHorizontal: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 1,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernamePrefix: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: Spacing.xs,
  },
  usernameInput: {
    flex: 1,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: Spacing.md,
  },
  errorText: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  hintText: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
});
