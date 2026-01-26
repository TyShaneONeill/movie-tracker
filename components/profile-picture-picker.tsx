import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/lib/theme-context';
import { pickImage, takePhoto } from '@/lib/image-utils';

interface ProfilePicturePickerProps {
  /** Current avatar URL */
  avatarUrl?: string | null;
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
  size = 120,
  isLoading = false,
  onImageSelected,
}: ProfilePicturePickerProps) {
  const { effectiveTheme } = useTheme();
  const colors = Colors[effectiveTheme];
  const [localLoading, setLocalLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loading = isLoading || localLoading;
  const displayUrl = avatarUrl || DEFAULT_AVATAR_PLACEHOLDER;

  const handleSelectImage = async (source: 'gallery' | 'camera') => {
    setShowModal(false);
    setLocalLoading(true);

    try {
      console.log('[ProfilePicturePicker] Selecting image from:', source);
      const result = source === 'gallery' ? await pickImage() : await takePhoto();

      if (result) {
        console.log('[ProfilePicturePicker] Image selected:', result.uri);
        await onImageSelected(result.uri, result.type);
      }
    } catch (error) {
      console.error('[ProfilePicturePicker] Error selecting image:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  const showImageOptions = () => {
    console.log('[ProfilePicturePicker] Opening image options modal');
    setShowModal(true);
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
              <Ionicons name="camera" size={18} color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Image Source Selection Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.card },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Change Profile Photo
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.modalOption,
                { backgroundColor: pressed ? colors.backgroundSecondary : 'transparent' },
              ]}
              onPress={() => handleSelectImage('camera')}
            >
              <Ionicons name="camera-outline" size={24} color={colors.text} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>
                Take Photo
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.modalOption,
                { backgroundColor: pressed ? colors.backgroundSecondary : 'transparent' },
              ]}
              onPress={() => handleSelectImage('gallery')}
            >
              <Ionicons name="images-outline" size={24} color={colors.text} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>
                Choose from Library
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.modalCancel,
                {
                  backgroundColor: pressed ? colors.backgroundSecondary : colors.background,
                },
              ]}
              onPress={() => setShowModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalCancel: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
