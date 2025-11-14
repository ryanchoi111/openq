/**
 * Main App Navigator
 * Handles routing between Auth and Main flows based on auth state
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { 
  RootStackParamList, 
  AuthStackParamList, 
  TenantStackParamList, 
  AgentStackParamList 
} from './types';

// Auth screens (to be created)
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import GuestJoinScreen from '../screens/auth/GuestJoinScreen';

// Tenant screens (to be created)
import TenantHomeScreen from '../screens/tenant/TenantHomeScreen';
import ScanQRScreen from '../screens/tenant/ScanQRScreen';
import WaitlistViewScreen from '../screens/tenant/WaitlistViewScreen';
import TenantHistoryScreen from '../screens/tenant/TenantHistoryScreen';

// Agent screens (to be created)
import AgentHomeScreen from '../screens/agent/AgentHomeScreen';
import PropertiesScreen from '../screens/agent/PropertiesScreen';
import CreatePropertyScreen from '../screens/agent/CreatePropertyScreen';
import EditPropertyScreen from '../screens/agent/EditPropertyScreen';
import CreateEventScreen from '../screens/agent/CreateEventScreen';
import EventDashboardScreen from '../screens/agent/EventDashboardScreen';
import QRDisplayScreen from '../screens/agent/QRDisplayScreen';
import EventHistoryScreen from '../screens/agent/EventHistoryScreen';
import CompletedEventWaitlistScreen from '../screens/agent/CompletedEventWaitlistScreen';
import CompletedToursScreen from '../screens/agent/CompletedToursScreen';
import ProfileScreen from '../screens/agent/ProfileScreen';
import SelectTenantsScreen from '../screens/agent/SelectTenantsScreen';
import EditEmailTemplateScreen from '../screens/agent/EditEmailTemplateScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const TenantStack = createNativeStackNavigator<TenantStackParamList>();
const AgentTabs = createBottomTabNavigator();
const AgentStack = createNativeStackNavigator<AgentStackParamList>();

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
      <TenantStack.Screen
        name="TenantHistory"
        component={TenantHistoryScreen}
        options={{ title: 'My History' }}
      />
    </TenantStack.Navigator>
  );
};

// Agent Tab Navigator (Main Screens with Bottom Tabs)
const AgentTabNavigator = () => {
  return (
    <AgentTabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 24,
          color: '#1e293b',
        },
        headerTitleAlign: 'left',
        headerLeftContainerStyle: {
          paddingLeft: 4,
        },
        headerTitleContainerStyle: {
          paddingLeft: 0,
        },
      }}
    >
      <AgentTabs.Screen
        name="AgentHome"
        component={AgentHomeScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: '',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="Properties"
        component={PropertiesScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: '',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business" size={size} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="CreateEvent"
        component={CreateEventScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: '',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="EventHistory"
        component={EventHistoryScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: '',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="Profile"
        component={ProfileScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: '',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          ),
        }}
      />
    </AgentTabs.Navigator>
  );
};

// Agent Navigator (Includes Tabs + Modal/Detail Screens)
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
        name="AgentTabs"
        component={AgentTabNavigator}
        options={{ headerShown: false }}
      />
      <AgentStack.Screen
        name="CreateProperty"
        component={CreatePropertyScreen}
        options={{ title: 'Add Property' }}
      />
      <AgentStack.Screen
        name="EditProperty"
        component={EditPropertyScreen}
        options={{ title: 'Edit Property' }}
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
        name="CompletedTours"
        component={CompletedToursScreen}
        options={{ title: 'Completed Tours' }}
      />
      <AgentStack.Screen
        name="CompletedEventWaitlist"
        component={CompletedEventWaitlistScreen}
        options={{ title: 'Event Waitlist' }}
      />
      <AgentStack.Screen
        name="SelectTenants"
        component={SelectTenantsScreen}
        options={{ title: 'Select Recipients' }}
      />
      <AgentStack.Screen
        name="EditEmailTemplate"
        component={EditEmailTemplateScreen}
        options={{ title: 'Edit Email Template' }}
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
