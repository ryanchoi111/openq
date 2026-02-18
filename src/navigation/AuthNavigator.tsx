/**
 * Auth Navigator
 * Handles authentication-related screens (Welcome, SignIn, SignUp, GuestJoin)
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

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
  const { user, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Don't render if user is authenticated
  const isAuthenticated = user && !isGuest;
  if (isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

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

