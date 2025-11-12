/**
 * Core type definitions for OpenHouse app
 */

// User roles
export type UserRole = 'agent' | 'tenant' | 'guest';

// Auth types
export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface GuestUser {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'guest';
}

// Property types
export interface Property {
  id: string;
  agent_id: string;
  address: string;
  address2?: string; // Optional: apartment, suite, unit, etc.
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  rent: number;
  description?: string;
  images?: string[];
  created_at: string;
  updated_at: string;
}

// Open House Event types
export interface OpenHouseEvent {
  id: string;
  property_id: string;
  agent_id: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  qr_code?: string;
  created_at: string;
  updated_at: string;
  property?: Property; // Populated via join
}

// Waitlist entry types
export interface WaitlistEntry {
  id: string;
  event_id: string;
  user_id?: string; // Null for guests
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  position: number;
  status: 'waiting' | 'touring' | 'completed' | 'skipped' | 'no-show';
  joined_at: string;
  notified_at?: string;
  started_tour_at?: string;
  completed_at?: string;
  expressed_interest: boolean;
  application_sent: boolean;
  notes?: string;
}

// Application types
export interface Application {
  id: string;
  event_id: string;
  waitlist_entry_id: string;
  property_id: string;
  recipient_email?: string;
  recipient_phone?: string;
  sent_at: string;
  status: 'sent' | 'viewed' | 'submitted';
  application_url?: string;
}

// Push notification types
export interface PushNotification {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  metadata?: {
    timestamp: string;
    version: string;
  };
}
