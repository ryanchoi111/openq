/**
 * Secure Storage Adapter for Supabase Auth
 * - Native (iOS/Android): Uses expo-secure-store for encrypted storage
 * - Web: Uses localStorage (unencrypted but necessary for web compatibility)
 */

import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// Only import SecureStore on native platforms
let SecureStore: any;
if (!isWeb) {
  SecureStore = require('expo-secure-store');
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb) {
        return localStorage.getItem(key);
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('[SecureStorage] Error getting item:', error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isWeb) {
        localStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('[SecureStorage] Error setting item:', error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (isWeb) {
        localStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('[SecureStorage] Error removing item:', error);
    }
  },
};
