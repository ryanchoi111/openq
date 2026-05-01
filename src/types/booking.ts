export type BookingQuestionType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'single_select';

export interface BookingAvailabilityWindow {
  day: number; // 0 Sunday - 6 Saturday
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface AgentBookingProfile {
  agent_id: string;
  slug: string;
  booking_enabled: boolean;
  timezone: string;
  default_booking_horizon_days: number;
  minimum_notice_minutes: number;
  slot_increment_minutes: number;
  working_hours: BookingAvailabilityWindow[];
  default_buffer_before_minutes: number;
  default_buffer_after_minutes: number;
  created_at?: string;
  updated_at?: string;
}

export interface BookingEventType {
  id: string;
  agent_id: string;
  label: string;
  duration_minutes: number;
  buffer_before_minutes?: number | null;
  buffer_after_minutes?: number | null;
  enabled: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface BookingQuestion {
  id: string;
  agent_id: string;
  prompt: string;
  question_type: BookingQuestionType;
  required: boolean;
  options?: string[] | null;
  sort_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BookingSettings {
  profile: AgentBookingProfile | null;
  eventTypes: BookingEventType[];
  questions: BookingQuestion[];
}

export interface BookingQuestionResponse {
  questionId: string;
  answer: unknown;
}
