import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme-context';
import { Colors } from '@/constants/theme';

export default function SettingsLayout() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="edit-avatar" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="delete-account" />
      <Stack.Screen name="blocked-users" />
      <Stack.Screen name="letterboxd-import" />
      <Stack.Screen name="tvtime-import" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="help" />
      <Stack.Screen name="feature-toggles" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
