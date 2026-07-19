import { Stack } from 'expo-router';

export default function EpisodeRoomLayout() {
  // File routes ([room]/index, [room]/all) register automatically; an explicit
  // <Stack.Screen name="[room]"> stopped matching after the directory split
  // and only produced a dev warning.
  return <Stack screenOptions={{ headerShown: false }} />;
}
