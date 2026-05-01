/**
 * OpenHouse App - Main Entry Point
 */

import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider } from './src/contexts/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import PublicBookingPage from './src/screens/public/PublicBookingPage';

function getPublicBookingRoute(): { slug: string; requestId: string | null } | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path || path.includes('/')) return null;
  if (['auth', 'main', 'expo'].includes(path.toLowerCase())) return null;
  const params = new URLSearchParams(window.location.search);
  return { slug: path, requestId: params.get('request') };
}

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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const publicBookingRoute = getPublicBookingRoute();
  if (publicBookingRoute) {
    return (
      <SafeAreaProvider>
        <PublicBookingPage slug={publicBookingRoute.slug} requestId={publicBookingRoute.requestId} />
        <StatusBar style="dark" translucent={false} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="light" translucent={false} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
