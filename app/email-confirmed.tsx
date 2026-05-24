import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';
import { Colors } from '@/constants/theme';

export default function EmailConfirmedScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useOnboarding();

  if (authLoading || onboardingLoading || (user && hasCompletedOnboarding === null)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.dark.tint} />
        <Text style={styles.title}>Email confirmed</Text>
        <Text style={styles.subtitle}>Signing you in…</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/signin" />;
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.background,
    padding: 24,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 24,
  },
  subtitle: {
    color: Colors.dark.icon,
    fontSize: 14,
    marginTop: 8,
  },
});
