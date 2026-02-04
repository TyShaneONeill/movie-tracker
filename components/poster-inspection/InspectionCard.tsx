import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  clamp,
} from 'react-native-reanimated';

interface InspectionCardProps {
  imageUrl: string;
  width: number;
  height: number;
}

export function InspectionCard({ imageUrl, width, height }: InspectionCardProps) {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Map translation to rotation (divide by 8 for sensitivity)
      rotateY.value = clamp(event.translationX / 8, -25, 25);
      rotateX.value = clamp(-event.translationY / 8, -25, 25);
    })
    .onEnd(() => {
      // Spring back to neutral
      rotateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      rotateY.value = withSpring(0, { damping: 15, stiffness: 150 });
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, { width, height }, cardStyle]}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
