import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'List',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.content}>
          <ThemedText style={[styles.title, { color: colors.text }]}>
            List Detail
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
            List ID: {id}
          </ThemedText>
          <ThemedText style={[styles.comingSoon, { color: colors.textTertiary }]}>
            Full list view coming soon...
          </ThemedText>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  title: {
    ...Typography.display.h3,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body.base,
    marginBottom: Spacing.md,
  },
  comingSoon: {
    ...Typography.body.sm,
  },
});
