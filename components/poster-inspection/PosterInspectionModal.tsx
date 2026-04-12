import React, { useEffect } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  useColorScheme,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { InspectionCard } from './InspectionCard';

interface PosterInspectionModalProps {
  visible: boolean;
  imageUrl: string;
  aiImageUrl?: string | null;
  movieTitle: string;
  onClose: () => void;
}

export function PosterInspectionModal({
  visible,
  imageUrl,
  aiImageUrl,
  movieTitle,
  onClose,
}: PosterInspectionModalProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  const baseWidth = Math.min(screenWidth, 480);
  const cardWidth = baseWidth * 0.85;
  const cardHeight = Math.min(cardWidth * 1.5, screenHeight * 0.80); // cap for landscape tablet

  // Use AI image if available, otherwise fall back to regular image
  const displayImageUrl = aiImageUrl || imageUrl;

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });
    } else {
      scale.value = 0.8;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!displayImageUrl) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.container}>
        <BlurView
          intensity={40}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.backdrop} onPress={onClose}>
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? 'rgba(0,0,0,0.9)'
                  : 'rgba(255,255,255,0.9)',
              },
            ]}
          />
        </Pressable>

        <Animated.View style={[styles.content, animatedStyle]}>
          <InspectionCard
            imageUrl={displayImageUrl}
            width={cardWidth}
            height={cardHeight}
          />
          <Text
            style={[
              styles.title,
              { color: isDark ? '#ffffff' : '#000000' },
            ]}
            numberOfLines={2}
          >
            {movieTitle}
          </Text>
        </Animated.View>

        <Pressable
          style={[
            styles.closeButton,
            {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(0,0,0,0.2)',
            },
          ]}
          onPress={onClose}
        >
          <Ionicons
            name="close"
            size={24}
            color={isDark ? '#ffffff' : '#000000'}
          />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
