/**
 * OpenHouse App - Main Entry Point
 */

import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { clerkPublishableKey } from './src/config/clerk';
import { AuthProvider } from './src/contexts/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';

// Needed for OAuth flows that use AuthSession under the hood (e.g. Clerk social login in Expo).
WebBrowser.maybeCompleteAuthSession();

export default function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  React.useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync(Ionicons.font);
        setFontsLoaded(true);
      } catch (e) {
        console.error('Error loading fonts:', e);
        // Still allow app to render even if fonts fail
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  if (!clerkPublishableKey) {
    console.error('Clerk publishable key is missing. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file.');
  }

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
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
