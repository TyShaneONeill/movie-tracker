import { supabase } from './supabase';
import { getFileExtension } from './image-utils';
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

    // Fetch the image as a blob
    const response = await fetch(imageUri);
    const blob = await response.blob();

    // Upload to Supabase Storage (upsert to replace existing)
    const { error: uploadError } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(filePath, blob, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[AvatarService] Upload error:', uploadError);
      return {
        success: false,
        error: uploadError.message,
      };
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from(AVATARS_BUCKET)
      .getPublicUrl(filePath);

    // Add cache-busting query param to force refresh
    const url = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    return {
      success: true,
      url,
    };
  } catch (error) {
    console.error('[AvatarService] Unexpected error:', error);
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
      console.error('[AvatarService] List error:', listError);
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
      console.error('[AvatarService] Delete error:', deleteError);
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AvatarService] Unexpected error:', error);
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
      console.error('[AvatarService] Profile update error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('[AvatarService] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}
