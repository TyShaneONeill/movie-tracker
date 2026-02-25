import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

const MAX_JOURNEY_WIDTH = 480;

export default function JourneyLayout() {
  const { effectiveTheme } = useTheme();
  const bg = Colors[effectiveTheme].background;

  // Override navigation theme background so the scene container behind
  // the 480px contentStyle matches the screen's own background color.
  const navTheme = effectiveTheme === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: bg } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: bg } };

  return (
    <NavigationThemeProvider value={navTheme}>
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: Platform.OS === 'web' ? {
          maxWidth: MAX_JOURNEY_WIDTH,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: bg,
        } : undefined,
      }}>
        <Stack.Screen name="[id]" />
        <Stack.Screen name="movie/[tmdbId]" />
        <Stack.Screen name="edit/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}
