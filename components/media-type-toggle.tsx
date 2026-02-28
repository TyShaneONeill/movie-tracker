import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import { Colors, BorderRadius } from '@/constants/theme';

export type MediaType = 'movies' | 'tv';

interface MediaTypeToggleProps {
  value: MediaType;
  onChange: (type: MediaType) => void;
}

export function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  return (
    <View style={[styles.container, {
      backgroundColor: colors.backgroundSecondary,
      borderColor: colors.border,
    }]}>
      <TouchableOpacity
        style={[styles.option, value === 'movies' && { backgroundColor: colors.tint }]}
        onPress={() => onChange('movies')}
        accessibilityRole="tab"
        accessibilityLabel="Movies"
        accessibilityState={{ selected: value === 'movies' }}
      >
        <Text style={[styles.optionText, { color: value === 'movies' ? '#fff' : colors.textSecondary }]}>
          Movies
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.option, value === 'tv' && { backgroundColor: colors.tint }]}
        onPress={() => onChange('tv')}
        accessibilityRole="tab"
        accessibilityLabel="TV Shows"
        accessibilityState={{ selected: value === 'tv' }}
      >
        <Text style={[styles.optionText, { color: value === 'tv' ? '#fff' : colors.textSecondary }]}>
          TV Shows
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    padding: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.full,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
