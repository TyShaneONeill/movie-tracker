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
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius, Gradients } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';

export default function SignInScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { signIn, signInWithApple, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = (): string | null => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
    if (!password) return 'Password is required';
    return null;
  };

  const handleSignIn = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace('/(tabs)');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple' | 'meta') => {
    if (provider === 'meta') {
      alert('Meta sign-in coming soon');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (provider === 'apple') {
        if (Platform.OS !== 'ios') {
          alert('Apple Sign-In is only available on iOS devices');
          return;
        }
        await signInWithApple();
      } else if (provider === 'google') {
        await signInWithGoogle();
      }
      // Navigate after successful sign-in
      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      // Don't show error for user cancellation
      if (!message.includes('cancelled') && !message.includes('failed')) {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipToDemo = () => {
    router.replace('/(tabs)');
  };

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
          {/* Logo & Title */}
          <View style={styles.header}>
            <LinearGradient
              colors={Gradients.main as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoContainer}
            >
              <Ionicons name="film" size={40} color="white" />
            </LinearGradient>
            <ThemedText style={[styles.title, { color: colors.text }]}>Welcome Back</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              Sign in to continue
            </ThemedText>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          {/* Email/Password Form */}
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
              editable={!isSubmitting}
            />

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

            <Pressable
              style={({ pressed }) => [
                styles.signInButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={handleSignIn}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.signInButtonText}>Sign In</ThemedText>
              )}
            </Pressable>
          </View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <ThemedText style={[styles.dividerText, { color: colors.textSecondary }]}>
              or continue with
            </ThemedText>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* OAuth Buttons */}
          <View style={styles.oauthContainer}>
            <Pressable
              onPress={() => handleOAuthSignIn('google')}
              style={({ pressed }) => [
                styles.socialButton,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.socialButtonContent}>
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
                  Google
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleOAuthSignIn('apple')}
              style={({ pressed }) => [
                styles.socialButton,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.socialButtonContent}>
                <Ionicons name="logo-apple" size={20} color={colors.text} />
                <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
                  Apple
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleOAuthSignIn('meta')}
              style={({ pressed }) => [
                styles.socialButton,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.socialButtonContent}>
                <Ionicons name="logo-facebook" size={20} color="#1877F2" />
                <ThemedText style={[styles.socialButtonText, { color: colors.text }]}>
                  Meta
                </ThemedText>
              </View>
            </Pressable>
          </View>

          {/* Footer Links */}
          <View style={styles.footer}>
            <View style={styles.signupContainer}>
              <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
                Don&apos;t have an account?{' '}
              </ThemedText>
              <Link href="/(auth)/signup" asChild>
                <Pressable>
                  <ThemedText style={[styles.linkText, { color: colors.tint }]}>Sign up</ThemedText>
                </Pressable>
              </Link>
            </View>
            <Pressable onPress={handleSkipToDemo}>
              <ThemedText style={[styles.skipText, { color: colors.textSecondary }]}>
                Skip to Demo App
              </ThemedText>
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
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 8,
  },
  title: {
    ...Typography.display.h2,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...Typography.body.base,
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
  form: {
    width: '100%',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  signInButton: {
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
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
  footer: {
    alignItems: 'center',
  },
  signupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  footerText: {
    ...Typography.body.sm,
  },
  linkText: {
    ...Typography.body.sm,
    fontWeight: '600',
  },
  skipText: {
    ...Typography.body.sm,
    textDecorationLine: 'underline',
  },
});
