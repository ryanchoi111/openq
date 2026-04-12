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
import { colors, typography } from '../utils/theme';
import { 
  RootStackParamList, 
  TenantStackParamList, 
  AgentStackParamList,
  AgentTabParamList,
} from './types';

// Auth Navigator
import AuthNavigator from './AuthNavigator';

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
import TourRequestDetailScreen from '../screens/agent/TourRequestDetailScreen';
import PropertyTourRequestsScreen from '../screens/agent/PropertyTourRequestsScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const TenantStack = createNativeStackNavigator<TenantStackParamList>();
const AgentTabs = createBottomTabNavigator<AgentTabParamList>();
const AgentStack = createNativeStackNavigator<AgentStackParamList>();

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
        tabBarActiveTintColor: colors.navy900,
        tabBarInactiveTintColor: colors.ink400,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 0.5,
          borderTopColor: colors.ink200,
          height: 49,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: typography.tabLabel.fontSize,
          fontWeight: typography.tabLabel.fontWeight,
        },
        headerStyle: {
          backgroundColor: colors.white,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: typography.heading.fontWeight,
          fontSize: typography.heading.fontSize,
          color: colors.ink900,
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
          tabBarLabel: 'Tours',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="Properties"
        component={PropertiesScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: 'Listings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="EventHistory"
        component={EventHistoryScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: 'PPL',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={24} color={color} />
          ),
        }}
      />
      <AgentTabs.Screen
        name="Profile"
        component={ProfileScreen as any}
        options={{
          headerTitle: 'OpenQ',
          tabBarLabel: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
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
          backgroundColor: colors.white,
        },
        headerShadowVisible: false,
        headerTintColor: colors.navy900,
        headerTitleStyle: {
          fontWeight: typography.subheading.fontWeight,
          fontSize: typography.subheading.fontSize,
          color: colors.ink900,
        },
        contentStyle: {
          backgroundColor: colors.white,
        },
      }}
    >
      <AgentStack.Screen
        name="AgentTabs"
        component={AgentTabNavigator}
        options={{ headerShown: false }}
      />
      <AgentStack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: 'New Tour' }}
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
      <AgentStack.Screen
        name="PropertyTourRequests"
        component={PropertyTourRequestsScreen}
        options={{ title: 'Property Requests' }}
      />
      <AgentStack.Screen
        name="TourRequestDetail"
        component={TourRequestDetailScreen}
        options={{ title: 'Tour Request' }}
      />
    </AgentStack.Navigator>
  );
};

// Main Navigator - routes based on user role
const MainNavigator = () => {
  const { user } = useAuth();

  if (!user || user.role === 'guest') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return user.role === 'agent' ? <AgentNavigator /> : <TenantNavigator />;
};

// Root Navigator
export const AppNavigator = () => {
  const { user, isGuest, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isAuthenticated = user && !isGuest;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : (
          <RootStack.Screen name="Main" component={MainNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
};
