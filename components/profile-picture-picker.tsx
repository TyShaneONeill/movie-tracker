import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { pickImage, takePhoto } from '@/lib/image-utils';

interface ProfilePicturePickerProps {
  /** Current avatar URL (remote) */
  avatarUrl?: string | null;
  /** Local preview URI - shown immediately when user picks an image, before upload completes */
  previewUri?: string | null;
  /** Size of the avatar (default 120) */
  size?: number;
  /** Whether an upload is in progress */
  isLoading?: boolean;
  /** Callback when an image is selected */
  onImageSelected: (imageUri: string, mimeType?: string) => Promise<void>;
}

const DEFAULT_AVATAR_PLACEHOLDER = 'https://i.pravatar.cc/300';

export function ProfilePicturePicker({
  avatarUrl,
  previewUri,
  size = 120,
  isLoading = false,
  onImageSelected,
}: ProfilePicturePickerProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [localLoading, setLocalLoading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const loading = isLoading || localLoading;
  // Priority: local preview (just selected) > prop preview > remote URL > placeholder
  const displayUrl = localPreview || previewUri || avatarUrl || DEFAULT_AVATAR_PLACEHOLDER;

  const showImageOptions = () => {
    Alert.alert(
      'Change Profile Photo',
      undefined,
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            try {
              const result = await takePhoto();
              if (!result) return;
              setLocalPreview(result.uri);
              setLocalLoading(true);
              try {
                await onImageSelected(result.uri, result.type);
                setLocalPreview(null);
              } catch {
                Alert.alert('Upload Failed', 'Could not upload profile photo. Please try again.');
              } finally {
                setLocalLoading(false);
              }
            } catch {
              Alert.alert('Error', 'Could not open camera. Please try again.');
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            try {
              const result = await pickImage();
              if (!result) return;
              setLocalPreview(result.uri);
              setLocalLoading(true);
              try {
                await onImageSelected(result.uri, result.type);
                setLocalPreview(null);
              } catch {
                Alert.alert('Upload Failed', 'Could not upload profile photo. Please try again.');
              } finally {
                setLocalLoading(false);
              }
            } catch {
              Alert.alert('Error', 'Could not open image picker. Please try again.');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={showImageOptions}
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
            borderColor: colors.tint,
          },
        ]}
      >
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
            <Ionicons name="camera" size={18} color="#fff" />
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
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
