/**
 * Auth Navigator
 * Handles authentication-related screens (Welcome, SignIn, SignUp, GuestJoin)
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth as useClerkAuth } from '@clerk/clerk-expo';

import { useAuth } from '../contexts/AuthContext';
import { AuthStackParamList } from './types';
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import GuestJoinScreen from '../screens/auth/GuestJoinScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();


// Protected Auth Screen Wrapper
// Redirects to home if user is already signed in
const ProtectedAuthScreen = ({ 
  component: Component, 
  ...props 
}: { 
  component: React.ComponentType<any>;
  [key: string]: any;
}) => {
  const { isSignedIn } = useClerkAuth();
  const { user, loading: authLoading } = useAuth();

  // Show loading only while auth context is loading
  // Don't block on Clerk's isLoaded since the screen components handle that
  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Don't render the screen if user is signed in (after loading is complete)
  // The AppNavigator will handle redirecting to Main, but we prevent rendering here
  if (isSignedIn || user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render the screen - Clerk hooks inside will handle their own loading states
  return <Component {...props} />;
};

// Wrapped components to avoid inline function warnings
const ProtectedSignInScreen = (props: any) => (
  <ProtectedAuthScreen component={SignInScreen} {...props} />
);

const ProtectedSignUpScreen = (props: any) => (
  <ProtectedAuthScreen component={SignUpScreen} {...props} />
);

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignIn" component={ProtectedSignInScreen} />
      <Stack.Screen name="SignUp" component={ProtectedSignUpScreen} />
      <Stack.Screen name="GuestJoin" component={GuestJoinScreen} />
    </Stack.Navigator>
  );
}

