import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { pickImage, takePhoto, type ImagePickerResult } from '@/lib/image-utils';

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
  const [pendingImage, setPendingImage] = useState<ImagePickerResult | null>(null);

  const loading = isLoading || localLoading;
  // Priority: local preview (just selected) > prop preview > remote URL > placeholder
  const displayUrl = localPreview || previewUri || avatarUrl || DEFAULT_AVATAR_PLACEHOLDER;

  const handleConfirm = async () => {
    if (!pendingImage) return;
    const image = pendingImage;
    setPendingImage(null);
    setLocalPreview(image.uri);
    setLocalLoading(true);
    try {
      await onImageSelected(image.uri, image.type);
      setLocalPreview(null);
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('Upload Failed', 'Could not upload profile photo. Please try again.');
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handlePickFromLibrary = async () => {
    try {
      const result = await pickImage();
      if (!result) return;
      setPendingImage(result);
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not open image picker. Please try again.');
      }
    }
  };

  const showImageOptions = () => {
    // On web, Alert.alert callbacks don't work — go directly to image picker
    if (Platform.OS === 'web') {
      handlePickFromLibrary();
      return;
    }

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
              setPendingImage(result);
            } catch {
              Alert.alert('Error', 'Could not open camera. Please try again.');
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: handlePickFromLibrary,
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <>
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

      {/* Image preview confirmation modal */}
      <Modal
        visible={pendingImage !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingImage(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Preview
            </Text>
            {pendingImage && (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: pendingImage.uri }}
                  style={styles.previewImage}
                />
              </View>
            )}
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setPendingImage(null)}
                style={[styles.modalButton, { backgroundColor: colors.background }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={[styles.modalButton, { backgroundColor: colors.tint }]}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  Use Photo
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  previewContainer: {
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
