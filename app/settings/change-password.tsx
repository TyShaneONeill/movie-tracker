import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { getFriendlyErrorMessage } from '@/lib/error-messages';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import Svg, { Path } from 'react-native-svg';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

const PASSWORD_MIN_LENGTH = 8;

export default function ChangePasswordScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { updatePassword } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validatePassword = () => {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleChangePassword = async () => {
    setError(null);

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await updatePassword(newPassword);

      if (updateError) {
        setError(getFriendlyErrorMessage(updateError));
      } else {
        setSuccess(true);
        // Clear form
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = newPassword.length >= PASSWORD_MIN_LENGTH && confirmPassword.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <ChevronLeftIcon color={colors.text} />
            </Pressable>
            <Text style={[Typography.display.h4, { color: colors.text }]}>Change Password</Text>
          </View>

          {/* Success Message */}
          {success && (
            <View style={[styles.successBanner, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Text style={[Typography.body.base, { color: colors.accentSecondary, fontWeight: '600' }]}>
                Password updated successfully!
              </Text>
              <Text style={[Typography.body.sm, { color: colors.accentSecondary, marginTop: Spacing.xs }]}>
                Your new password is now active.
              </Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>New Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: error && newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH
                      ? colors.tint
                      : 'transparent',
                  },
                ]}
                placeholder="Enter new password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  setError(null);
                  setSuccess(false);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[Typography.body.xs, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
                Minimum {PASSWORD_MIN_LENGTH} characters
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: error && confirmPassword.length > 0 && newPassword !== confirmPassword
                      ? colors.tint
                      : 'transparent',
                  },
                ]}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setError(null);
                  setSuccess(false);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Error Message */}
            {error && (
              <Text style={[Typography.body.sm, { color: colors.tint, marginTop: Spacing.sm }]}>
                {error}
              </Text>
            )}

            {/* Submit Button */}
            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: isFormValid && !isLoading ? colors.tint : colors.card,
                  opacity: pressed && isFormValid ? 0.8 : 1,
                },
              ]}
              onPress={handleChangePassword}
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text
                  style={[
                    Typography.body.base,
                    {
                      color: isFormValid ? 'white' : colors.textTertiary,
                      fontWeight: '600',
                    },
                  ]}
                >
                  Update Password
                </Text>
              )}
            </Pressable>
          </View>

          {/* Info Text */}
          <Text style={[Typography.body.sm, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl }]}>
            You will remain signed in after changing your password.
          </Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  successBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  form: {
    paddingHorizontal: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 2,
  },
  submitButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
});
