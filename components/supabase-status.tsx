import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSupabaseConnection } from '@/hooks/use-supabase-connection';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export function SupabaseStatus() {
  const { isConnected, isLoading, error } = useSupabaseConnection();
  const { effectiveTheme } = useTheme();

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="small" color={Colors[effectiveTheme].tint} />
        <ThemedText style={styles.text}>
          Checking Supabase connection...
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.indicator,
          { backgroundColor: isConnected ? '#22c55e' : '#ef4444' },
        ]}
      />
      <ThemedText style={styles.text}>
        {isConnected ? 'Connected to Supabase' : `Supabase Error: ${error}`}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    fontSize: 14,
  },
});
