import { Stack } from 'expo-router';

export default function EpisodeRoomLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[room]" options={{ headerShown: false }} />
    </Stack>
  );
}
