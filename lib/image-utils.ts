import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';

export interface ImagePickerResult {
  uri: string;
  width: number;
  height: number;
  type?: string;
  fileName?: string;
}

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1], // Square crop
  quality: 0.8, // 80% quality for compression
};

/**
 * Request permission to access the media library
 */
async function requestMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true; // Web doesn't require permissions
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your photo library to upload a profile picture.',
      [{ text: 'OK' }]
    );
    return false;
  }

  return true;
}

/**
 * Request permission to access the camera
 */
async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }

  const { status } = await ImagePicker.requestCameraPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your camera to take a profile picture.',
      [{ text: 'OK' }]
    );
    return false;
  }

  return true;
}

/**
 * Pick an image from the device's gallery
 */
export async function pickImage(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestMediaLibraryPermission();

  if (!hasPermission) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    type: asset.mimeType,
    fileName: asset.fileName ?? undefined,
  };
}

/**
 * Take a photo with the device's camera
 */
export async function takePhoto(): Promise<ImagePickerResult | null> {
  const hasPermission = await requestCameraPermission();

  if (!hasPermission) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync(IMAGE_PICKER_OPTIONS);

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    type: asset.mimeType,
    fileName: asset.fileName ?? undefined,
  };
}

/**
 * Get the file extension from a URI or MIME type
 */
export function getFileExtension(uri: string, mimeType?: string): string {
  // Try to get from MIME type first
  if (mimeType) {
    const mimeExtMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    if (mimeExtMap[mimeType]) {
      return mimeExtMap[mimeType];
    }
  }

  // Fallback to URI parsing
  const match = uri.match(/\.(\w+)$/);
  if (match) {
    return match[1].toLowerCase();
  }

  // Default to jpg
  return 'jpg';
}

// ============================================================================
// Base64 Conversion Utilities
// ============================================================================

/**
 * Convert an image URI to base64 string
 * Works on iOS, Android, and Web platforms
 */
export async function imageUriToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Web: Fetch the blob and convert to base64
    return webImageToBase64(uri);
  }

  // Native (iOS/Android): Use FileSystem
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64;
  } catch (error) {
    // TODO: Replace with Sentry error tracking
    // Try web fallback method as last resort
    try {
      return await webImageToBase64(uri);
    } catch (fallbackError) {
      // TODO: Replace with Sentry error tracking
      throw new Error('Failed to read image file');
    }
  }
}

/**
 * Convert a web image URI/blob to base64
 */
async function webImageToBase64(uri: string): Promise<string> {
  try {
    // Fetch the image as a blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = reader.result.split(',')[1] || reader.result;
          resolve(base64);
        } else {
          reject(new Error('Failed to convert image to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // TODO: Replace with Sentry error tracking
    throw new Error('Failed to convert web image to base64');
  }
}

/**
 * Get MIME type from a file URI or extension
 */
export function getMimeTypeFromUri(uri: string): string {
  const extension = getFileExtension(uri).toLowerCase();

  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };

  return mimeTypes[extension] || 'image/jpeg';
}
