import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/lib/theme-context';
import type { SearchType } from '@/lib/tmdb.types';

interface SearchTypeToggleProps {
  value: SearchType;
  onChange: (type: SearchType) => void;
}

export function SearchTypeToggle({ value, onChange }: SearchTypeToggleProps) {
  const { effectiveTheme } = useTheme();

  // Use a consistent accent color that works in both modes
  const activeColor = '#0a7ea4';
  const inactiveTextColor = effectiveTheme === 'dark' ? '#fff' : '#333';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: effectiveTheme === 'dark' ? '#1e2022' : '#f5f5f5',
          borderColor: effectiveTheme === 'dark' ? '#333' : '#e0e0e0',
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.option,
          value === 'title' && { backgroundColor: activeColor },
        ]}
        onPress={() => onChange('title')}
      >
        <ThemedText
          style={[
            styles.optionText,
            { color: value === 'title' ? '#fff' : inactiveTextColor },
          ]}
        >
          By Title
        </ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.option,
          value === 'actor' && { backgroundColor: activeColor },
        ]}
        onPress={() => onChange('actor')}
      >
        <ThemedText
          style={[
            styles.optionText,
            { color: value === 'actor' ? '#fff' : inactiveTextColor },
          ]}
        >
          By Actor
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
