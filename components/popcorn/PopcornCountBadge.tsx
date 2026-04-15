import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function PopcornCountBadge({ count }: { count: number }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>🍿 {count.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 16,
    alignSelf: 'center',
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
