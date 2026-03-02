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
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { getFriendlyErrorMessage } from '@/lib/error-messages';

export default function ForgotPasswordScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const validateEmail = (): string | null => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
    return null;
  };

  const handleResetPassword = async () => {
    const validationError = validateEmail();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { error: resetError } = await resetPasswordForEmail(email);

      if (resetError) {
        setError(getFriendlyErrorMessage(resetError));
        return;
      }

      setEmailSent(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (emailSent) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: colors.tint + '20' }]}>
            <Ionicons name="mail-outline" size={48} color={colors.tint} />
          </View>
          <ThemedText style={[styles.title, { color: colors.text }]}>
            Check Your Email
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a password reset link to{'\n'}
            <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{email}</ThemedText>
          </ThemedText>
          <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
            Didn&apos;t receive it? Check your spam folder or try again.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.primaryButtonText}>Back to Sign In</ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              setEmailSent(false);
              setError(null);
            }}
          >
            <ThemedText style={[styles.secondaryButtonText, { color: colors.text }]}>
              Try Again
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Back Button */}
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logoImage}
            />
            <ThemedText style={[styles.title, { color: colors.text }]}>
              Forgot Password?
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              Enter your email and we&apos;ll send you a link to reset your password.
            </ThemedText>
          </View>

          {/* Error Message */}
          {error && (
            <View style={[styles.errorContainer, { backgroundColor: `${colors.error}1A` }]}>
              <ThemedText style={[styles.errorText, { color: colors.error }]}>{error}</ThemedText>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  color: colors.text,
                  borderColor: colors.border || '#333',
                },
              ]}
              placeholder="Email"
              placeholderTextColor={colors.icon}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!isSubmitting}
              returnKeyType="send"
              onSubmitEditing={handleResetPassword}
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleResetPassword}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Send Reset Link</ThemedText>
              )}
            </Pressable>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: Spacing.lg,
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display.h2,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...Typography.body.base,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.md,
  },
  hint: {
    ...Typography.body.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  errorContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    textAlign: 'center',
    ...Typography.body.sm,
  },
  form: {
    width: '100%',
    gap: Spacing.md,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  primaryButton: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    height: 56,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
