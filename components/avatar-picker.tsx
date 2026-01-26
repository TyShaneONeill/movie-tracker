import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { pickImage, takePhoto } from '@/lib/image-utils';

interface AvatarPickerProps {
  /** Current avatar URL */
  avatarUrl?: string | null;
  /** Size of the avatar (default 100) */
  size?: number;
  /** Whether an upload is in progress */
  isLoading?: boolean;
  /** Callback when an image is selected */
  onImageSelected: (imageUri: string, mimeType?: string) => Promise<void>;
  /** Optional border color */
  borderColor?: string;
}

const DEFAULT_AVATAR_PLACEHOLDER = 'https://i.pravatar.cc/300';

export function AvatarPicker({
  avatarUrl,
  size = 100,
  isLoading = false,
  onImageSelected,
  borderColor,
}: AvatarPickerProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [localLoading, setLocalLoading] = useState(false);

  const loading = isLoading || localLoading;
  const displayUrl = avatarUrl || DEFAULT_AVATAR_PLACEHOLDER;

  const handleSelectImage = async (source: 'gallery' | 'camera') => {
    setLocalLoading(true);

    try {
      const result = source === 'gallery' ? await pickImage() : await takePhoto();

      if (result) {
        await onImageSelected(result.uri, result.type);
      }
    } catch (error) {
      console.error('[AvatarPicker] Error selecting image:', error);
      Alert.alert(
        'Upload Failed',
        error instanceof Error ? error.message : 'Failed to upload image. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLocalLoading(false);
    }
  };

  const showImageOptions = () => {
    console.log('[AvatarPicker] showImageOptions called - Platform:', Platform.OS);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleSelectImage('camera');
          } else if (buttonIndex === 2) {
            handleSelectImage('gallery');
          }
        }
      );
    } else {
      // For Android and Web, use Alert
      Alert.alert(
        'Change Profile Photo',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: () => handleSelectImage('camera') },
          { text: 'Choose from Library', onPress: () => handleSelectImage('gallery') },
        ],
        { cancelable: true }
      );
    }
  };

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[AvatarPicker] TouchableOpacity onPress triggered');
        showImageOptions();
      }}
      disabled={loading}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: borderColor ?? colors.tint,
          },
        ]}
      >
        {/* Avatar Image */}
        <Image
          source={{ uri: displayUrl }}
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
            },
          ]}
        />

        {/* Loading Overlay */}
        {loading && (
          <View
            style={[
              styles.loadingOverlay,
              {
                borderRadius: size / 2,
              },
            ]}
          >
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        )}

        {/* Camera Icon Badge */}
        {!loading && (
          <View
            style={[
              styles.cameraButton,
              {
                backgroundColor: colors.tint,
                borderColor: colors.background,
              },
            ]}
          >
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderWidth: 3,
  },
  avatar: {
    backgroundColor: '#333',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
