/**
 * Trailer Modal
 * Full-screen modal for playing YouTube trailers in-app
 * using react-native-youtube-iframe.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  StatusBar,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact } from '@/lib/haptics';
import { Spacing } from '@/constants/theme';
import { Typography } from '@/constants/typography';

interface TrailerModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** YouTube video ID */
  videoKey: string;
  /** Display name for the trailer (e.g. "Official Trailer") */
  trailerName?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const PLAYER_HEIGHT = Math.round((SCREEN_WIDTH * 9) / 16);

/**
 * TrailerModal - full-screen modal for playing YouTube trailers
 *
 * @example
 * <TrailerModal
 *   visible={isVisible}
 *   onClose={() => setIsVisible(false)}
 *   videoKey="dQw4w9WgXcQ"
 *   trailerName="Official Trailer"
 * />
 */
export function TrailerModal({
  visible,
  onClose,
  videoKey,
  trailerName,
}: TrailerModalProps) {
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') {
      setPlaying(false);
    }
  }, []);

  const handleClose = () => {
    hapticImpact();
    setPlaying(false);
    setError(false);
    onClose();
  };

  const handleError = useCallback(() => {
    setError(true);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <StatusBar hidden={visible} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.trailerName} numberOfLines={1}>
            {trailerName || 'Trailer'}
          </Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>

        {/* Player */}
        <View style={styles.playerContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#a1a1aa" />
              <Text style={styles.errorText}>
                This trailer is unavailable
              </Text>
            </View>
          ) : (
            <YoutubePlayer
              height={PLAYER_HEIGHT}
              videoId={videoKey}
              play={playing}
              onChangeState={onStateChange}
              onError={handleError}
              webViewProps={{
                allowsInlineMediaPlayback: true,
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  trailerName: {
    ...Typography.body.lg,
    color: '#fff',
    flex: 1,
    marginRight: Spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorText: {
    ...Typography.body.base,
    color: '#a1a1aa',
    textAlign: 'center',
  },
});
