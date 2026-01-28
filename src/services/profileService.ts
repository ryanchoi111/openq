/**
 * Profile Service
 * Handles user profile operations including file uploads
 */

import { supabase } from '../config/supabase';
import { User } from '../types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

async function uploadToStorage(
  bucket: string,
  filePath: string,
  fileUri: string,
  contentType: string
): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: contentType,
    name: filePath.split('/').pop(),
  } as any);

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export const profileService = {
  async uploadProfilePicture(userId: string, imageUri: string): Promise<string> {
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `profile-pictures/${fileName}`;
    const contentType = IMAGE_CONTENT_TYPES[fileExt] || 'image/jpeg';

    return uploadToStorage('profile-pictures', filePath, imageUri, contentType);
  },

  async updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as User;
  },

  async updateProfilePicture(userId: string, imageUri: string): Promise<User> {
    const imageUrl = await this.uploadProfilePicture(userId, imageUri);
    return this.updateUserProfile(userId, { profile_picture: imageUrl });
  },

  async deleteProfilePicture(userId: string, imageUrl: string): Promise<void> {
    const urlParts = imageUrl.split('/profile-pictures/');
    if (urlParts.length < 2) {
      throw new Error('Invalid image URL');
    }

    const filePath = urlParts[1];
    const { error } = await supabase.storage
      .from('profile-pictures')
      .remove([`profile-pictures/${filePath}`]);

    if (error) throw error;

    await this.updateUserProfile(userId, { profile_picture: undefined });
  },

  async uploadHousingApplicationDocument(userId: string, documentUri: string): Promise<string> {
    const fileName = `${userId}-application-${Date.now()}.pdf`;
    const filePath = `housing-applications/${fileName}`;

    return uploadToStorage('housing-applications', filePath, documentUri, 'application/pdf');
  },

  async updateHousingApplication(userId: string, documentUri: string): Promise<User> {
    const documentUrl = await this.uploadHousingApplicationDocument(userId, documentUri);
    return this.updateUserProfile(userId, { housing_application_url: documentUrl });
  },
};

