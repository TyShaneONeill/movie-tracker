import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/hooks/use-auth';
import { getFriendlyErrorMessage } from '@/lib/error-messages';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import Svg, { Path, Polyline } from 'react-native-svg';

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

function AlertTriangleIcon({ color }: { color: string }) {
  return (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <Path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </Svg>
  );
}

export default function DeleteAccountScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const { deleteAccount } = useAuth();

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataToDelete = [
    'All your movie lists and watchlists',
    'Your watched movie history',
    'All ratings and reviews',
    'Your First Takes',
    'Theater visit history',
    'Profile information',
  ];

  const handleDeleteAccount = async () => {
    if (!isConfirmed) return;

    const doDelete = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: deleteError } = await deleteAccount();

        if (deleteError) {
          setError(getFriendlyErrorMessage(deleteError));
          setIsLoading(false);
        } else {
          // Show toast before navigation so user sees it
          Toast.show({
            type: 'info',
            text1: 'Account deleted',
            visibilityTime: 2000,
          });
          // Navigate to signin screen on success
          router.replace('/(auth)/signin');
        }
      } catch {
        setError('An unexpected error occurred');
        setIsLoading(false);
      }
    };

    // Platform-specific confirmation dialog
    if (Platform.OS === 'web') {
      if (window.confirm('This action is permanent and cannot be undone. Are you absolutely sure you want to delete your account?')) {
        await doDelete();
      }
    } else {
      Alert.alert(
        'Delete Account',
        'This action is permanent and cannot be undone. Are you absolutely sure you want to delete your account?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: doDelete,
          },
        ]
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <ChevronLeftIcon color={colors.text} />
          </Pressable>
          <Text style={[Typography.display.h4, { color: colors.text }]}>Delete Account</Text>
        </View>

        {/* Warning Banner */}
        <View style={[styles.warningBanner, { backgroundColor: 'rgba(255, 68, 68, 0.1)' }]}>
          <AlertTriangleIcon color="#ff4444" />
          <View style={styles.warningContent}>
            <Text style={[Typography.body.base, { color: '#ff4444', fontWeight: '600' }]}>
              This action is permanent
            </Text>
            <Text style={[Typography.body.sm, { color: '#ff6b6b', marginTop: Spacing.xs }]}>
              Deleting your account will permanently remove all your data. This cannot be undone.
            </Text>
          </View>
        </View>

        {/* What will be deleted */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            The following data will be permanently deleted:
          </Text>

          <View style={[styles.deleteList, { backgroundColor: colors.card }]}>
            {dataToDelete.map((item, index) => (
              <View
                key={index}
                style={[
                  styles.deleteItem,
                  index < dataToDelete.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <TrashIcon color={colors.textSecondary} />
                <Text style={[Typography.body.base, { color: colors.text, marginLeft: Spacing.sm, flex: 1 }]}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Confirmation Checkbox */}
        <Pressable
          style={styles.confirmationRow}
          onPress={() => setIsConfirmed(!isConfirmed)}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: isConfirmed ? '#ff4444' : 'transparent',
                borderColor: isConfirmed ? '#ff4444' : colors.textSecondary,
              },
            ]}
          >
            {isConfirmed && <CheckIcon color="white" />}
          </View>
          <Text style={[Typography.body.base, { color: colors.text, flex: 1 }]}>
            I understand that this action is permanent and all my data will be deleted forever.
          </Text>
        </Pressable>

        {/* Error Message */}
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(255, 68, 68, 0.1)' }]}>
            <Text style={[Typography.body.sm, { color: '#ff4444' }]}>
              {error}
            </Text>
          </View>
        )}

        {/* Delete Button */}
        <Pressable
          style={({ pressed }) => [
            styles.deleteButton,
            {
              backgroundColor: isConfirmed && !isLoading ? '#ff4444' : colors.card,
              opacity: pressed && isConfirmed ? 0.8 : 1,
            },
          ]}
          onPress={handleDeleteAccount}
          disabled={!isConfirmed || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text
              style={[
                Typography.body.base,
                {
                  color: isConfirmed ? 'white' : colors.textTertiary,
                  fontWeight: '600',
                },
              ]}
            >
              Delete My Account
            </Text>
          )}
        </Pressable>

        {/* Info Text */}
        <Text style={[Typography.body.sm, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.lg }]}>
          If you have any concerns or need help, please contact support before deleting your account.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  warningContent: {
    flex: 1,
  },
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  deleteList: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  deleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  deleteButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginHorizontal: Spacing.md,
  },
});
