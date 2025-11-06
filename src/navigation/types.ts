/**
 * Navigation type definitions
 */

import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  GuestJoin: { eventId?: string };
};

export type MainTabParamList = {
  TenantTab: NavigatorScreenParams<TenantStackParamList>;
  AgentTab: NavigatorScreenParams<AgentStackParamList>;
};

export type TenantStackParamList = {
  TenantHome: undefined;
  ScanQR: undefined;
  WaitlistView: { eventId: string; entryId: string };
  PropertyDetails: { propertyId: string };
};

export type AgentStackParamList = {
  AgentHome: undefined;
  Properties: undefined;
  CreateProperty: undefined;
  EditProperty: { propertyId: string };
  CreateEvent: { propertyId?: string };
  EventDashboard: { eventId: string };
  QRDisplay: { eventId: string };
};
