import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRewardedAd } from '@/hooks/use-rewarded-ad';
import { useTheme } from '@/lib/theme-context';
import { Colors, Spacing, FontSizes } from '@/constants/theme';

interface RewardedAdButtonProps {
  onRewardEarned: () => void | Promise<void>;
}

export function RewardedAdButton({ onRewardEarned }: RewardedAdButtonProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { loaded, showAd, reloadAd } = useRewardedAd();
  const [showing, setShowing] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Rewarded ads are mobile-only (AdMob). On web, hide this button
  // and let the upgrade prompt be the only option.
  if (Platform.OS === 'web') return null;

  const handlePress = async () => {
    if (!loaded || showing) return;
    setShowing(true);
    try {
      const earned = await showAd();
      if (earned) {
        await onRewardEarned();
        reloadAd();
      }
    } catch (error) {
      console.error('Rewarded ad error:', error);
    } finally {
      setShowing(false);
    }
  };

  if (!loaded && !showing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <Text style={styles.loadingText}>Loading ad...</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, showing && styles.buttonDisabled]}
      onPress={handlePress}
      disabled={showing}
      activeOpacity={0.8}
    >
      {showing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name="play-circle-outline" size={20} color="#fff" />
      )}
      <Text style={styles.buttonText}>
        {showing ? 'Playing Ad...' : 'Watch Ad for +1 Scan'}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (colors: typeof Colors.dark) =>
  StyleSheet.create({
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.sm,
      gap: Spacing.xs,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: FontSizes.sm,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tint,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: 12,
      gap: Spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#fff',
      fontSize: FontSizes.base,
      fontWeight: '600',
    },
  });
