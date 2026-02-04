/**
 * Scanner Screen
 * Clean, button-focused UI for scanning movie tickets
 * Reference: ui-mocks/scan_ticket.html
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle } from 'react-native-svg';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/lib/theme-context';
import { useScanTicket, fetchScanStatus } from '@/hooks/use-scan-ticket';
import { useAuth } from '@/lib/auth-context';
import { imageUriToBase64, getMimeTypeFromUri } from '@/lib/image-utils';
import { GuestSignInPrompt } from '@/components/guest-sign-in-prompt';

// ============================================================================
// Constants
// ============================================================================

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

// ============================================================================
// Ticket SVG Component
// ============================================================================

function TicketIllustration() {
  return (
    <Svg width={140} height={140} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="ticketGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#E11D48" />
          <Stop offset="100%" stopColor="#BE123C" />
        </LinearGradient>
      </Defs>
      {/* Back Ticket */}
      <Path
        d="M15,30 Q15,25 20,25 H80 Q85,25 85,30 V45 Q80,45 80,50 Q80,55 85,55 V70 Q85,75 80,75 H20 Q15,75 15,70 V55 Q20,55 20,50 Q20,45 15,45 V30 Z"
        fill="rgba(225, 29, 72, 0.2)"
        transform="rotate(-10 50 50) translate(-5, 5)"
      />
      {/* Front Ticket */}
      <Path
        d="M15,30 Q15,25 20,25 H80 Q85,25 85,30 V45 Q80,45 80,50 Q80,55 85,55 V70 Q85,75 80,75 H20 Q15,75 15,70 V55 Q20,55 20,50 Q20,45 15,45 V30 Z"
        fill="url(#ticketGradient)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
      />
      {/* Dashed Line */}
      <Line
        x1="25"
        y1="50"
        x2="75"
        y2="50"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      {/* Ticket Content Circle */}
      <Circle cx="50" cy="50" r="12" fill="rgba(0,0,0,0.2)" />
    </Svg>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function ScannerScreen() {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Auth state - check if user is logged in
  const { user, isLoading: isAuthLoading } = useAuth();

  // Permission state
  const [cameraPermission, setCameraPermission] = useState<PermissionStatus>('undetermined');
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);

  // Scan ticket hook
  const { scanTicket, isScanning, error, clearError } = useScanTicket();

  // Scans remaining (null = loading, will be fetched on mount)
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);

  // ============================================================================
  // Permission Handling
  // ============================================================================

  const checkCameraPermission = useCallback(async () => {
    setIsCheckingPermission(true);
    try {
      if (Platform.OS === 'web') {
        // Web doesn't have persistent permission state we can check
        // We'll show the camera UI and let the browser handle it
        setCameraPermission('granted');
        return;
      }

      const { status } = await ImagePicker.getCameraPermissionsAsync();
      setCameraPermission(status as PermissionStatus);
    } catch (err) {
      // TODO: Replace with Sentry error tracking
      setCameraPermission('undetermined');
    } finally {
      setIsCheckingPermission(false);
    }
  }, []);

  const requestCameraPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        setCameraPermission('granted');
        return;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setCameraPermission(status as PermissionStatus);
    } catch (err) {
      // TODO: Replace with Sentry error tracking
    }
  }, []);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else if (Platform.OS === 'android') {
        await Linking.openSettings();
      }
    } catch (err) {
      // TODO: Replace with Sentry error tracking
    }
  }, []);

  // Check permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, [checkCameraPermission]);

  // Fetch scan status when user is authenticated
  useEffect(() => {
    if (user && !isAuthLoading) {
      fetchScanStatus()
        .then((status) => {
          setScansRemaining(status.scansRemaining);
        })
        .catch((err) => {
          // Default to 3 if fetch fails
          // TODO: Add error tracking (e.g., Sentry)
          setScansRemaining(3);
        });
    } else if (!user && !isAuthLoading) {
      // Not logged in - show 3 (they'll be prompted to sign in)
      setScansRemaining(3);
    }
  }, [user, isAuthLoading]);

  // ============================================================================
  // Floating Animation
  // ============================================================================

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [floatAnim]);

  const floatTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const floatRotate = floatAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '2deg', '0deg'],
  });

  // ============================================================================
  // Image Processing
  // ============================================================================

  const processImage = useCallback(async (uri: string, mimeType?: string) => {
    clearError();

    try {
      // Convert image to base64
      const base64 = await imageUriToBase64(uri);
      const finalMimeType = mimeType || getMimeTypeFromUri(uri);

      // Call the scan-ticket API
      const result = await scanTicket(base64, finalMimeType);

      // Update scans remaining
      setScansRemaining(result.scansRemaining);

      // Navigate to review screen with results
      router.push({
        pathname: '/scan/review',
        params: {
          tickets: JSON.stringify(result.tickets),
          scansRemaining: result.scansRemaining.toString(),
          duplicatesRemoved: result.duplicatesRemoved.toString(),
        },
      });
    } catch (err) {
      // Error is already set by the hook
      // TODO: Replace with Sentry error tracking
    }
  }, [scanTicket, clearError]);

  // ============================================================================
  // Camera and Gallery Actions
  // ============================================================================

  const handleCameraCapture = useCallback(async () => {
    try {
      // Request permission if needed
      if (cameraPermission !== 'granted' && Platform.OS !== 'web') {
        await requestCameraPermission();
        const { status } = await ImagePicker.getCameraPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      await processImage(asset.uri, asset.mimeType);
    } catch (err) {
      // TODO: Replace with Sentry error tracking
    }
  }, [cameraPermission, requestCameraPermission, processImage]);

  const handleGallerySelect = useCallback(async () => {
    try {
      // Request media library permission
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      await processImage(asset.uri, asset.mimeType);
    } catch (err) {
      // TODO: Replace with Sentry error tracking
    }
  }, [processImage]);

  // ============================================================================
  // Render States
  // ============================================================================

  // Loading state while checking auth, permissions, or scan status
  if (isAuthLoading || isCheckingPermission || scansRemaining === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </SafeAreaView>
      </View>
    );
  }

  // Not authenticated state - prompt user to sign in
  if (!user) {
    return (
      <GuestSignInPrompt
        icon="ticket-outline"
        title="Scan Tickets"
        message="Sign in to scan movie tickets and log your cinema experiences"
      />
    );
  }

  // Permission denied state
  if (cameraPermission === 'denied') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.permissionTitle, { color: colors.text }]}>
            Camera Access Denied
          </Text>
          <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
            Camera access is needed to scan tickets. Please enable it in your device settings.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={openSettings}
          >
            <Text style={styles.primaryButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.outlineButton,
              { borderColor: colors.border },
              pressed && styles.buttonPressed,
            ]}
            onPress={handleGallerySelect}
          >
            <Ionicons name="images-outline" size={20} color={colors.text} />
            <Text style={[styles.outlineButtonText, { color: colors.text }]}>
              Upload from Gallery
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // Scans exhausted state
  if (scansRemaining === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.permissionContainer}>
          <Ionicons name="time-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.permissionTitle, { color: colors.text }]}>
            Daily Limit Reached
          </Text>
          <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
            {"You've used all 3 scans for today. Your limit resets at midnight."}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Manually Add Movie</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ============================================================================
  // Main UI
  // ============================================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={styles.topSafeArea} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {/* Animated Ticket Illustration */}
          <Animated.View
            style={[
              styles.ticketVisual,
              {
                transform: [
                  { translateY: floatTranslateY },
                  { rotate: floatRotate },
                ],
              },
            ]}
          >
            <TicketIllustration />
          </Animated.View>

          {/* Title and Instructions */}
          <View style={styles.textContainer}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Capture Ticket</Text>
            <Text style={[styles.instructionsText, { color: colors.textSecondary }]}>
              Align your movie ticket within the frame to automatically scan details.
            </Text>
          </View>

          {/* Tips Badge */}
          <View style={[styles.tipsBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.tipsBadgeText, { color: colors.textSecondary }]}>
              Ensure good lighting and readability
            </Text>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <Pressable style={styles.errorContainer} onPress={clearError}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={[styles.errorSubtext, { color: colors.textSecondary }]}>
              Tap to dismiss
            </Text>
          </Pressable>
        )}

        {/* Actions Section */}
        <View style={styles.actionsSection}>
          {/* Take Photo Button */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !isScanning && styles.buttonPressed,
              isScanning && styles.buttonDisabled,
            ]}
            onPress={handleCameraCapture}
            disabled={isScanning}
          >
            {isScanning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Take Photo</Text>
              </>
            )}
          </Pressable>

          {/* Upload from Gallery Button */}
          <Pressable
            style={({ pressed }) => [
              styles.outlineButton,
              { borderColor: colors.border },
              pressed && !isScanning && styles.buttonPressed,
              isScanning && styles.buttonDisabled,
            ]}
            onPress={handleGallerySelect}
            disabled={isScanning}
          >
            <Ionicons name="image-outline" size={20} color={colors.text} />
            <Text style={[styles.outlineButtonText, { color: colors.text }]}>
              Upload from Gallery
            </Text>
          </Pressable>

          {/* Scans Remaining */}
          <View style={styles.scansCountContainer}>
            <View style={[
              styles.scansDot,
              scansRemaining === 0 && styles.scansDotExhausted,
            ]} />
            <Text style={[
              styles.scansCountText,
              { color: scansRemaining === 0 ? '#f87171' : colors.textTertiary },
            ]}>
              {scansRemaining === null
                ? 'Loading...'
                : scansRemaining === 0
                  ? 'No scans remaining today'
                  : `${scansRemaining} scan${scansRemaining !== 1 ? 's' : ''} remaining today`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: 100, // Space for bottom tab bar
  },

  // Top safe area
  topSafeArea: {
    backgroundColor: 'transparent',
  },

  // Hero Section
  heroContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    gap: Spacing.lg,
  },
  ticketVisual: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroTitle: {
    ...Typography.display.h3,
  },
  instructionsText: {
    ...Typography.body.sm,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },

  // Tips Badge
  tipsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tipsBadgeText: {
    ...Typography.body.xs,
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  errorText: {
    ...Typography.body.sm,
    color: '#f87171',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    ...Typography.body.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  // Actions Section
  actionsSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#e11d48',
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  primaryButtonText: {
    ...Typography.button.primary,
    color: '#fff',
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  outlineButtonText: {
    ...Typography.button.primary,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Scans Count
  scansCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xs,
  },
  scansDot: {
    width: 6,
    height: 6,
    backgroundColor: '#e11d48',
    borderRadius: 3,
    marginRight: 6,
  },
  scansDotExhausted: {
    backgroundColor: '#f87171',
  },
  scansCountText: {
    ...Typography.body.xs,
  },

  // Permission states
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  permissionTitle: {
    ...Typography.display.h3,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  permissionText: {
    ...Typography.body.base,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
});
