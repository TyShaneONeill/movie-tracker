import { Stack } from 'expo-router';

export default function TvShowDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reviews" options={{ headerShown: true }} />
    </Stack>
  );
}
