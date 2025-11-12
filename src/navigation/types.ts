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

export type AgentStackParamList = {
  AgentHome: undefined;
  Properties: undefined;
  CreateProperty: undefined;
  EditProperty: { propertyId: string };
  CreateEvent: { propertyId?: string };
  EventDashboard: { eventId: string };
  QRDisplay: { eventId: string };
  EventHistory: undefined;
  CompletedEventWaitlist: { eventId: string };
};
