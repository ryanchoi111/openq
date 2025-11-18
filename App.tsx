/**
 * OpenHouse App - Main Entry Point
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from './src/utils/clerkTokenCache';
import { clerkPublishableKey } from './src/config/clerk';
import { AuthProvider } from './src/contexts/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  if (!clerkPublishableKey) {
    console.error('Clerk publishable key is missing. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file.');
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppNavigator />
          <StatusBar style="light" translucent={false} />
        </AuthProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
