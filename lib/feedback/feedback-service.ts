import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { getFileExtension } from '@/lib/image-utils';
import { captureException } from '@/lib/sentry';
import type { Database } from '@/lib/database.types';

export const FEEDBACK_BUCKET = 'feedback-screenshots';

export type FeedbackType = 'feature_request' | 'feedback';
export type FeedbackStatus = 'new' | 'triaged' | 'planned' | 'shipped' | 'declined';

export type FeatureRequestRow = Database['public']['Tables']['feature_requests']['Row'];

export interface SubmitFeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  screenshotUrl?: string | null;
  appVersion?: string | null;
  platform?: string | null;
}

export interface UploadScreenshotResult {
  success: boolean;
  /** Storage path inside the feedback-screenshots bucket (NOT a signed URL). */
  path?: string;
  error?: string;
}

/**
 * Upload a screenshot to the private feedback-screenshots bucket.
 * Returns the storage path (admins will sign it on read).
 */
export async function uploadFeedbackScreenshot(
  userId: string,
  imageUri: string,
  mimeType?: string,
): Promise<UploadScreenshotResult> {
  try {
    const ext = getFileExtension(imageUri, mimeType);
    const filename = `${cryptoRandomId()}.${ext}`;
    const filePath = `${userId}/${filename}`;
    const contentType = mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    let uploadBody: ArrayBuffer;

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      uploadBody = await response.arrayBuffer();
    } else {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      uploadBody = bytes.buffer;
    }

    const { error: uploadError } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .upload(filePath, uploadBody, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      captureException(
        uploadError instanceof Error ? uploadError : new Error(String(uploadError)),
        { context: 'feedback-screenshot-upload' },
      );
      return { success: false, error: uploadError.message };
    }

    return { success: true, path: filePath };
  } catch (error) {
    captureException(
      error instanceof Error ? error : new Error(String(error)),
      { context: 'feedback-screenshot-upload' },
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload screenshot',
    };
  }
}

/**
 * Call the submit_feature_request RPC. Throws on error (TanStack Query mutation
 * surfaces the message in its onError).
 */
export async function submitFeatureRequest(
  input: SubmitFeedbackInput,
): Promise<FeatureRequestRow> {
  const { data, error } = await supabase.rpc('submit_feature_request', {
    p_type: input.type,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_screenshot_url: input.screenshotUrl ?? '',
    p_app_version: input.appVersion ?? '',
    p_platform: input.platform ?? '',
  });

  if (error) {
    throw new Error(error.message);
  }

  // The RPC returns the row itself; supabase-js types it as the row shape.
  return data as unknown as FeatureRequestRow;
}

/**
 * Fetch the current user's recent submissions (most recent first).
 */
export async function fetchMyFeedback(limit = 20): Promise<FeatureRequestRow[]> {
  const { data, error } = await supabase
    .from('feature_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FeatureRequestRow[];
}

/**
 * Pick a single image from the device library for use as a feedback
 * screenshot. Unlike the avatar picker, this does NOT force a square crop —
 * we want the screenshot in its original aspect ratio.
 */
export interface FeedbackImagePickerResult {
  uri: string;
  type?: string;
  fileName?: string;
}

export async function pickFeedbackScreenshot(): Promise<FeedbackImagePickerResult | null> {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to attach a screenshot.',
        [{ text: 'OK' }],
      );
      return null;
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: asset.mimeType,
    fileName: asset.fileName ?? undefined,
  };
}

/**
 * Best-effort short random ID. Avoids pulling in a uuid lib for one call site —
 * collision risk per (userId, filename) is negligible at our scale.
 */
function cryptoRandomId(): string {
  try {
    // Most RN runtimes (and web) have crypto.randomUUID().
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
