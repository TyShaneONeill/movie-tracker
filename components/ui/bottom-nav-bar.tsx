import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { hapticImpact } from '@/lib/haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';

export interface NavItem {
  icon: (color: string) => React.ReactNode;
  label: string;
  onPress: () => void;
}

export interface BottomNavBarProps {
  items: NavItem[];
  activeIndex: number;
}

/**
 * BottomNavBar - Glassmorphism floating tab bar
 *
 * Features:
 * - 4 tabs: Home, Scan, Stats, Profile
 * - Glassmorphism effect with backdrop blur
 * - Active state with accent color
 * - Haptic feedback on iOS
 * - Floating above content with rounded corners
 */
export function BottomNavBar({ items, activeIndex }: BottomNavBarProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];

  const handlePress = (index: number, onPress: () => void) => {
    hapticImpact();
    onPress();
  };

  const navContent = (
    <View style={styles.navItems}>
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        return (
          <Pressable
            key={index}
            onPress={() => handlePress(index, item.onPress)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.navItem,
              pressed && styles.navItemPressed,
            ]}
          >
            <View style={styles.iconContainer}>
              {item.icon(isActive ? colors.tint : colors.textTertiary)}
            </View>
            <ThemedText
              style={[
                styles.label,
                { color: isActive ? colors.tint : colors.textTertiary },
              ]}
            >
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      {Platform.OS === 'web' ? (
        <View
          style={[
            styles.blurContainer,
            styles.webBlurFallback,
            {
              backgroundColor: colors.glass,
              borderColor: colors.border,
            },
          ]}
        >
          {navContent}
        </View>
      ) : (
        <BlurView
          intensity={80}
          tint={effectiveTheme === 'light' ? 'light' : 'dark'}
          style={[
            styles.blurContainer,
            {
              backgroundColor: colors.glass,
              borderColor: colors.border,
            },
          ]}
        >
          {navContent}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  blurContainer: {
    width: '100%',
    maxWidth: 440,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  webBlurFallback: {
    // CSS backdrop-filter for glassmorphism on web
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any,
      default: {},
    }),
  },
  navItems: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navItemPressed: {
    transform: [{ scale: 0.9 }],
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
