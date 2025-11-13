/**
 * Profile Service
 * Handles user profile operations including image upload
 */

import { supabase } from '../config/supabase';
import { User } from '../types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

export const profileService = {
  /**
   * Upload profile picture to Supabase Storage
   */
  async uploadProfilePicture(userId: string, imageUri: string): Promise<string> {
    try {
      console.log('[uploadProfilePicture] Starting upload for user:', userId);
      
      // Get file extension from URI
      const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;
      
      // Determine content type
      let contentType = 'image/jpeg';
      if (fileExt === 'png') contentType = 'image/png';
      if (fileExt === 'gif') contentType = 'image/gif';
      if (fileExt === 'webp') contentType = 'image/webp';
      
      // For React Native, we need to use FormData
      // Create a file object compatible with React Native
      const file = {
        uri: imageUri,
        type: contentType,
        name: fileName,
      };
      
      // Upload using fetch directly to get better control
      const formData = new FormData();
      formData.append('file', file as any);
      
      // Get Supabase storage URL and token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/profile-pictures/${filePath}`;
      
      // Upload using fetch with proper headers
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[uploadProfilePicture] Upload failed:', errorText);
        throw new Error(`Upload failed: ${errorText}`);
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);
      
      console.log('[uploadProfilePicture] Upload successful:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('[uploadProfilePicture] Error:', error);
      throw error;
    }
  },

  /**
   * Update user profile in database
   */
  async updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
    try {
      console.log('[updateUserProfile] Updating user:', userId, updates);
      
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) {
        console.error('[updateUserProfile] Update error:', error);
        throw error;
      }
      
      console.log('[updateUserProfile] Update successful');
      return data as User;
    } catch (error) {
      console.error('[updateUserProfile] Error:', error);
      throw error;
    }
  },

  /**
   * Update profile picture (upload and update database)
   */
  async updateProfilePicture(userId: string, imageUri: string): Promise<User> {
    try {
      // Upload image to storage
      const imageUrl = await this.uploadProfilePicture(userId, imageUri);
      
      // Update user profile with new image URL
      const updatedUser = await this.updateUserProfile(userId, {
        profile_picture: imageUrl,
      });
      
      return updatedUser;
    } catch (error) {
      console.error('[updateProfilePicture] Error:', error);
      throw error;
    }
  },

  /**
   * Delete profile picture
   */
  async deleteProfilePicture(userId: string, imageUrl: string): Promise<void> {
    try {
      // Extract file path from URL
      const urlParts = imageUrl.split('/profile-pictures/');
      if (urlParts.length < 2) {
        throw new Error('Invalid image URL');
      }
      
      const filePath = urlParts[1];
      
      // Delete from storage
      const { error } = await supabase.storage
        .from('profile-pictures')
        .remove([`profile-pictures/${filePath}`]);
      
      if (error) {
        console.error('[deleteProfilePicture] Delete error:', error);
        throw error;
      }
      
      // Update user profile to remove image URL
      await this.updateUserProfile(userId, {
        profile_picture: undefined,
      });
      
      console.log('[deleteProfilePicture] Delete successful');
    } catch (error) {
      console.error('[deleteProfilePicture] Error:', error);
      throw error;
    }
  },

  /**
   * Upload housing application document to Supabase Storage
   */
  async uploadHousingApplicationDocument(userId: string, documentUri: string): Promise<string> {
    try {
      console.log('[uploadHousingApplicationDocument] Starting upload for user:', userId);
      
      const fileName = `${userId}-application-${Date.now()}.pdf`;
      const filePath = `housing-applications/${fileName}`;
      
      // For React Native, we need to use FormData
      const file = {
        uri: documentUri,
        type: 'application/pdf',
        name: fileName,
      };
      
      // Upload using fetch directly to get better control
      const formData = new FormData();
      formData.append('file', file as any);
      
      // Get Supabase storage URL and token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/housing-applications/${filePath}`;
      
      // Upload using fetch with proper headers
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('[uploadHousingApplicationDocument] Upload failed:', errorText);
        throw new Error(`Upload failed: ${errorText}`);
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('housing-applications')
        .getPublicUrl(filePath);
      
      console.log('[uploadHousingApplicationDocument] Upload successful:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('[uploadHousingApplicationDocument] Error:', error);
      throw error;
    }
  },

  /**
   * Update housing application (upload and update database)
   */
  async updateHousingApplication(userId: string, documentUri: string): Promise<User> {
    try {
      // Upload document to storage
      const documentUrl = await this.uploadHousingApplicationDocument(userId, documentUri);
      
      // Update user profile with new document URL
      const updatedUser = await this.updateUserProfile(userId, {
        housing_application_url: documentUrl,
      });
      
      return updatedUser;
    } catch (error) {
      console.error('[updateHousingApplication] Error:', error);
      throw error;
    }
  },
};

