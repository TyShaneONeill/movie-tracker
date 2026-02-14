import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from './supabase';
import { getFileExtension } from './image-utils';
import { captureException } from '@/lib/sentry';
import type { Database } from './database.types';

const AVATARS_BUCKET = 'avatars';

export interface UploadAvatarResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Upload an avatar image to Supabase Storage
 * Storage path pattern: avatars/{userId}/avatar.{ext}
 */
export async function uploadAvatar(
  userId: string,
  imageUri: string,
  mimeType?: string
): Promise<UploadAvatarResult> {
  try {
    const ext = getFileExtension(imageUri, mimeType);
    const filePath = `${userId}/avatar.${ext}`;
    const contentType = mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    // Read file as base64 and decode to ArrayBuffer (reliable in React Native)
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Upload to Supabase Storage (upsert to replace existing)
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(filePath, bytes.buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      captureException(uploadError instanceof Error ? uploadError : new Error(String(uploadError)), { context: 'avatar-upload' });
      return {
        success: false,
        error: uploadError.message,
      };
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from(AVATARS_BUCKET)
      .getPublicUrl(filePath);

    const url = publicUrlData.publicUrl;

    return {
      success: true,
      url,
    };
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'avatar-upload' });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload avatar',
    };
  }
}

/**
 * Get the public URL for a user's avatar
 */
export function getAvatarUrl(userId: string, extension = 'jpg'): string {
  const filePath = `${userId}/avatar.${extension}`;
  const { data } = supabase.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/**
 * Delete a user's avatar from storage
 */
export async function deleteAvatar(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // List all files in the user's folder
    const { data: files, error: listError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .list(userId);

    if (listError) {
      captureException(listError instanceof Error ? listError : new Error(String(listError)), { context: 'avatar-delete-list' });
      return { success: false, error: listError.message };
    }

    if (!files || files.length === 0) {
      return { success: true }; // No files to delete
    }

    // Delete all files in the user's folder
    const filePaths = files.map(file => `${userId}/${file.name}`);
    const { error: deleteError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .remove(filePaths);

    if (deleteError) {
      captureException(deleteError instanceof Error ? deleteError : new Error(String(deleteError)), { context: 'avatar-delete-remove' });
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'avatar-delete' });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete avatar',
    };
  }
}

/**
 * Update the profiles table with the new avatar URL
 */
export async function updateProfileAvatarUrl(
  userId: string,
  avatarUrl: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Database['public']['Tables']['profiles']['Update'] = {
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase
      .from('profiles') as any)
      .update(updateData)
      .eq('id', userId);

    if (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), { context: 'avatar-update-profile' });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { context: 'avatar-update-profile' });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}

/**
 * Build an avatar URL with a content-based cache key.
 * Uses the profile's updated_at timestamp so CDNs can cache the image
 * and only bust the cache when the avatar actually changes.
 * Strips any legacy ?t= query params from old URLs stored in the DB.
 */
export function buildAvatarUrl(
  avatarUrl: string | null | undefined,
  updatedAt?: string | null
): string | null {
  if (!avatarUrl) return null;

  // Strip any existing query params (legacy ?t= cache-busting)
  const cleanUrl = avatarUrl.split('?')[0];

  if (!updatedAt) return cleanUrl;

  return `${cleanUrl}?v=${encodeURIComponent(updatedAt)}`;
}
