import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
  ScrollView,
  Image,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact } from '@/lib/haptics';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/hooks/use-auth';
import { getFriendlyErrorMessage } from '@/lib/error-messages';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { Typography } from '@/constants/typography';
import { ContentContainer } from '@/components/content-container';

export default function SignUpScreen() {
  const { effectiveTheme } = useTheme();
  const { signUp, signIn, signInWithApple, signInWithGoogle, signInWithFacebook, isGoogleSignInAvailable } = useAuth();

  const colors = Colors[effectiveTheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);

  const validateForm = (): string | null => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
    if (password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleSignUp = async () => {
    hapticImpact();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { error: signUpError, needsEmailConfirmation } = await signUp(email, password);

      if (signUpError) {
        setError(getFriendlyErrorMessage(signUpError));
        return;
      }

      if (needsEmailConfirmation) {
        setShowEmailConfirmation(true);
        return;
      }

      // Auto sign in after successful signup (when email confirmation is disabled)
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(getFriendlyErrorMessage(signInError));
        return;
      }

      // Navigation is handled automatically by useProtectedRoute in _layout.tsx
      // which will check onboarding status and redirect appropriately
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple' | 'meta') => {
    hapticImpact();
    setError(null);
    setIsSubmitting(true);

    try {
      if (provider === 'apple') {
        if (Platform.OS !== 'ios' && Platform.OS !== 'web') {
          alert('Apple Sign-In is only available on iOS and web');
          return;
        }
        await signInWithApple();
      } else if (provider === 'google') {
        await signInWithGoogle();
      } else if (provider === 'meta') {
        await signInWithFacebook();
      }
      // Navigation is handled automatically by useProtectedRoute in _layout.tsx
      // which will check onboarding status and redirect appropriately
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      // Don't show error for user cancellation
      if (!message.includes('cancelled')) {
        setError(getFriendlyErrorMessage(message));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showEmailConfirmation) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <View style={[styles.confirmationIconCircle, { backgroundColor: colors.tint + '20' }]}>
            <Ionicons name="mail-outline" size={48} color={colors.tint} />
          </View>
          <ThemedText type="title" style={styles.title}>Verify Your Email</ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a confirmation link to{'\n'}
            <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{email}</ThemedText>
          </ThemedText>
          <ThemedText style={[styles.confirmationHint, { color: colors.textSecondary }]}>
            Please check your inbox and click the link to activate your account.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => router.replace('/(auth)/signin')}
          >
            <ThemedText style={styles.buttonText}>Go to Sign In</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
          <ContentContainer>
          <View style={styles.header}>
            <Image
              source={effectiveTheme === 'dark'
                ? require('@/assets/images/PocketStubs_Logo_Dark.png')
                : require('@/assets/images/PocketStubs_Logo_Light.png')}
              style={styles.logoImage}
            />
            <ThemedText type="title" style={styles.title}>Join PocketStubs</ThemedText>
            <ThemedText style={styles.subtitle}>Start tracking your cinema journey</ThemedText>
          </View>

          {error && <ThemedText style={[styles.errorText, { color: colors.error, backgroundColor: `${colors.error}1A` }]}>{error}</ThemedText>}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
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
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: colors.border || '#333',
                  },
                ]}
                placeholder="Password"
                placeholderTextColor={colors.icon}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isSubmitting}
              />
            </View>

            <View style={styles.inputGroup}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.card,
                    color: colors.text,
                    borderColor: colors.border || '#333',
                  },
                ]}
                placeholder="Confirm Password"
                placeholderTextColor={colors.icon}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!isSubmitting}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleSignUp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Create Account</ThemedText>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <ThemedText style={[styles.dividerText, { color: colors.icon }]}>
                or sign up with
              </ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* OAuth Buttons */}
            <View style={styles.oauthContainer}>
              <Pressable
                onPress={() => handleOAuthSignIn('google')}
                style={({ pressed }) => [
                  styles.socialButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: !isGoogleSignInAvailable ? 0.4 : pressed ? 0.7 : 1
                  },
                ]}
                disabled={isSubmitting || !isGoogleSignInAvailable}
              >
                <View style={styles.socialButtonContent}>
                  <Ionicons name="logo-google" size={20} color={isGoogleSignInAvailable ? "#DB4437" : colors.textSecondary} />
                  <ThemedText style={[styles.socialButtonText, { color: isGoogleSignInAvailable ? colors.text : colors.textSecondary }]}>
                    Google
                  </ThemedText>
                </View>
              </Pressable>

              {(Platform.OS === 'ios' || Platform.OS === 'web') && (
                <Pressable
                  onPress={() => handleOAuthSignIn('apple')}
                  style={({ pressed }) => [
                    styles.socialButton,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  disabled={isSubmitting}
                >
                  <View style={styles.socialButtonContent}>
                    <Ionicons name="logo-apple" size={20} color={colors.text} />
                    <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
                      Apple
                    </ThemedText>
                  </View>
                </Pressable>
              )}

              <Pressable
                onPress={() => handleOAuthSignIn('meta')}
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
                disabled={isSubmitting}
              >
                <View style={styles.socialButtonContent}>
                  <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                  <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
                    Facebook
                  </ThemedText>
                </View>
              </Pressable>

            </View>

            <View style={styles.signinContainer}>
              <ThemedText style={{ color: colors.icon }}>Already have an account? </ThemedText>
              <Link href="/(auth)/signin" asChild>
                <Pressable>
                  <ThemedText type="link" style={{ color: colors.tint, fontWeight: '600' }}>
                    Sign In
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </View>
          </ContentContainer>
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
  header: {
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 20,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
  },
  form: {
    width: '100%',
    ...(Platform.OS === 'web' ? { maxWidth: 400, alignSelf: 'center' as const } : {}),
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  button: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...Typography.body.sm,
    marginHorizontal: Spacing.md,
  },
  oauthContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  socialButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  socialButtonText: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
  signinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  confirmationIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  confirmationHint: {
    ...Typography.body.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
