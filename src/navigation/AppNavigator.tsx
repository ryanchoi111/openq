/**
 * Main App Navigator
 * Handles routing between Auth and Main flows based on auth state
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import { RootStackParamList, AuthStackParamList } from './types';

// Auth screens (to be created)
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import GuestJoinScreen from '../screens/auth/GuestJoinScreen';

// Tenant screens (to be created)
import TenantHomeScreen from '../screens/tenant/TenantHomeScreen';
import ScanQRScreen from '../screens/tenant/ScanQRScreen';
import WaitlistViewScreen from '../screens/tenant/WaitlistViewScreen';

// Agent screens (to be created)
import AgentHomeScreen from '../screens/agent/AgentHomeScreen';
import PropertiesScreen from '../screens/agent/PropertiesScreen';
import CreatePropertyScreen from '../screens/agent/CreatePropertyScreen';
import CreateEventScreen from '../screens/agent/CreateEventScreen';
import EventDashboardScreen from '../screens/agent/EventDashboardScreen';
import QRDisplayScreen from '../screens/agent/QRDisplayScreen';
import EventHistoryScreen from '../screens/agent/EventHistoryScreen';
import CompletedEventWaitlistScreen from '../screens/agent/CompletedEventWaitlistScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const TenantStack = createNativeStackNavigator();
const AgentStack = createNativeStackNavigator();

// Auth Navigator
const AuthNavigator = () => {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="GuestJoin" component={GuestJoinScreen} />
    </AuthStack.Navigator>
  );
};

// Tenant Navigator
const TenantNavigator = () => {
  return (
    <TenantStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: '#f8fafc',
        },
      }}
    >
      <TenantStack.Screen
        name="TenantHome"
        component={TenantHomeScreen}
        options={{ title: 'Home' }}
      />
      <TenantStack.Screen
        name="ScanQR"
        component={ScanQRScreen}
        options={{ title: 'Scan QR Code' }}
      />
      <TenantStack.Screen
        name="WaitlistView"
        component={WaitlistViewScreen}
        options={{ title: 'Your Position' }}
      />
    </TenantStack.Navigator>
  );
};

// Agent Navigator
const AgentNavigator = () => {
  return (
    <AgentStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: '#f8fafc',
        },
      }}
    >
      <AgentStack.Screen
        name="AgentHome"
        component={AgentHomeScreen}
        options={{ headerShown: false }}
      />
      <AgentStack.Screen
        name="Properties"
        component={PropertiesScreen}
        options={{ title: 'My Properties' }}
      />
      <AgentStack.Screen
        name="CreateProperty"
        component={CreatePropertyScreen}
        options={{ title: 'Add Property' }}
      />
      <AgentStack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: 'Create Open House' }}
      />
      <AgentStack.Screen
        name="EventDashboard"
        component={EventDashboardScreen}
        options={{ title: 'Manage Queue' }}
      />
      <AgentStack.Screen
        name="QRDisplay"
        component={QRDisplayScreen}
        options={{ title: 'QR Code' }}
      />
      <AgentStack.Screen
        name="EventHistory"
        component={EventHistoryScreen}
        options={{ title: 'Event History' }}
      />
      <AgentStack.Screen
        name="CompletedEventWaitlist"
        component={CompletedEventWaitlistScreen}
        options={{ title: 'Event Waitlist' }}
      />
    </AgentStack.Navigator>
  );
};

// Main Navigator - routes based on user role
const MainNavigator = () => {
  const { user } = useAuth();

  // Directly return the appropriate navigator based on user role
  return user?.role === 'agent' ? <AgentNavigator /> : <TenantNavigator />;
};

// Root Navigator
export const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <RootStack.Screen name="Main" component={MainNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};
