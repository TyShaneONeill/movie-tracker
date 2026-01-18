/**
 * Scanner Screen
 * Full-screen camera placeholder with scan overlay and controls
 * Reference: ui-mocks/scanner.html
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SCAN_FRAME_WIDTH = 280;
const SCAN_FRAME_HEIGHT = 400;

export default function ScannerScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animated scan line that moves from top to bottom
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanLineAnim]);

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_FRAME_HEIGHT],
  });

  const scanLineOpacity = scanLineAnim.interpolate({
    inputRange: [0, 0.1, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View style={styles.container}>
      {/* Camera Feed Placeholder */}
      <View style={styles.cameraView}>
        {/* Dark overlay simulating camera feed */}
        <View style={styles.cameraFeed} />
      </View>

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Scan Ticket</Text>
        <Pressable style={styles.headerButton}>
          <Ionicons name="document-outline" size={18} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {/* Scan Frame Overlay */}
      <View style={styles.scanOverlayContainer}>
        {/* Dark overlay around the scan frame */}
        <View style={styles.overlayMask}>
          <View style={styles.scanFrame}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />

            {/* Animated scan line */}
            <Animated.View
              style={[
                styles.scanLine,
                {
                  transform: [{ translateY: scanLineTranslateY }],
                  opacity: scanLineOpacity,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Helper Text */}
      <View style={styles.helperTextContainer}>
        <Text style={[styles.helperText, { color: colors.text }]}>
          Align ticket within frame
        </Text>
      </View>

      {/* Bottom Controls */}
      <View style={styles.scanControls}>
        {/* Flash Toggle */}
        <Pressable style={styles.controlButton}>
          <Ionicons name="flash-outline" size={24} color={colors.text} />
        </Pressable>

        {/* Shutter Button */}
        <Pressable style={styles.shutterButton}>
          <View style={styles.shutterInner} />
        </Pressable>

        {/* Gallery Button */}
        <Pressable style={styles.controlButton}>
          <Ionicons name="images-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  cameraFeed: {
    flex: 1,
    backgroundColor: '#000',
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerButton: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayMask: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  scanFrame: {
    width: SCAN_FRAME_WIDTH,
    height: SCAN_FRAME_HEIGHT,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: BorderRadius.lg,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#fff',
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 4,
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#e11d48',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  helperTextContainer: {
    position: 'absolute',
    top: '65%',
    width: '100%',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  scanControls: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  controlButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.full,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: BorderRadius.full,
    backgroundColor: '#fff',
  },
});
