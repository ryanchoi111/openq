/**
 * Navigation type definitions
 */

import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  GuestJoin: { eventId?: string };
};

export type TenantStackParamList = {
  TenantHome: undefined;
  ScanQR: undefined;
  WaitlistView: { eventId: string; entryId: string };
  PropertyDetails: { propertyId: string };
  TenantHistory: undefined;
};

export type AgentTabParamList = {
  AgentHome: undefined;
  Properties: undefined;
  EventHistory: undefined;
  Profile: undefined;
};

export type AgentStackParamList = {
  AgentTabs: NavigatorScreenParams<AgentTabParamList> | undefined;
  AgentHome: undefined; // Home tab (accessible from stack for navigation.reset)
  Properties: undefined; // Properties tab
  CreateEvent: { propertyId?: string }; // Create event tab (accessible from stack)
  EventHistory: undefined; // History tab
  Profile: undefined; // Profile tab
  CreateProperty: undefined;
  EditProperty: { propertyId: string };
  EventDashboard: { eventId: string };
  QRDisplay: { eventId: string };
  CompletedTours: { eventId: string };
  CompletedEventWaitlist: { eventId: string };
  SelectTenants: { eventId: string };
  EditEmailTemplate: undefined;
  TourRequestDetail: { tourRequest: import('../types/gmail').TourRequest };
  PropertyTourRequests: { propertyAddress: string; tourRequests: import('../types/gmail').TourRequest[] };
};
