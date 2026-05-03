import { supabase } from '../config/supabase';
import type {
  AgentBookingProfile,
  BookingAvailabilityWindow,
  BookingEventType,
  BookingQuestion,
  BookingQuestionType,
  BookingSettings,
} from '../types/booking';

export const DEFAULT_WORKING_HOURS: BookingAvailabilityWindow[] = [
  { day: 1, start: '10:00', end: '18:00' },
  { day: 2, start: '10:00', end: '18:00' },
  { day: 3, start: '10:00', end: '18:00' },
  { day: 4, start: '10:00', end: '18:00' },
  { day: 5, start: '10:00', end: '18:00' },
];

export function sanitizeBookingSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function defaultSlugFromName(name: string): string {
  return sanitizeBookingSlug(name) || `agent-${Date.now()}`;
}

export function buildBookingUrl(slug: string, requestId?: string): string {
  const base = `https://www.openqapp.xyz/${encodeURIComponent(slug)}`;
  return requestId ? `${base}?request=${encodeURIComponent(requestId)}` : base;
}

export function createDefaultProfile(agentId: string, name: string): AgentBookingProfile {
  return {
    agent_id: agentId,
    slug: defaultSlugFromName(name),
    booking_enabled: false,
    timezone: 'America/New_York',
    default_booking_horizon_days: 14,
    minimum_notice_minutes: 0,
    slot_increment_minutes: 30,
    working_hours: DEFAULT_WORKING_HOURS,
    default_buffer_before_minutes: 0,
    default_buffer_after_minutes: 15,
  };
}

export function createDefaultEventTypes(agentId: string): Omit<BookingEventType, 'id'>[] {
  return [
    {
      agent_id: agentId,
      label: '15 min tour',
      duration_minutes: 15,
      buffer_before_minutes: 0,
      buffer_after_minutes: 15,
      enabled: true,
      sort_order: 0,
    },
    {
      agent_id: agentId,
      label: '30 min tour',
      duration_minutes: 30,
      buffer_before_minutes: 0,
      buffer_after_minutes: 15,
      enabled: true,
      sort_order: 1,
    },
  ];
}

export function createDefaultQuestions(agentId: string): Omit<BookingQuestion, 'id'>[] {
  return [
    {
      agent_id: agentId,
      prompt: 'What is your move-in date?',
      question_type: 'date',
      required: true,
      options: null,
      enabled: true,
      sort_order: 0,
    },
    {
      agent_id: agentId,
      prompt: 'What is your budget?',
      question_type: 'number',
      required: true,
      options: null,
      enabled: true,
      sort_order: 1,
    },
    {
      agent_id: agentId,
      prompt: "Send me your roommates' full names, phone numbers, and emails. (If none, write 'none')",
      question_type: 'textarea',
      required: true,
      options: null,
      enabled: true,
      sort_order: 2,
    },
    {
      agent_id: agentId,
      prompt: 'Are you open to touring similar available properties?',
      question_type: 'boolean',
      required: false,
      options: null,
      enabled: true,
      sort_order: 3,
    },
  ];
}

export const bookingService = {
  async getSettings(agentId: string): Promise<BookingSettings> {
    const [profileRes, eventTypesRes, questionsRes] = await Promise.all([
      supabase
        .from('agent_booking_profiles')
        .select('*')
        .eq('agent_id', agentId)
        .maybeSingle(),
      supabase
        .from('booking_event_types')
        .select('*')
        .eq('agent_id', agentId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('booking_questions')
        .select('*')
        .eq('agent_id', agentId)
        .order('sort_order', { ascending: true }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (eventTypesRes.error) throw eventTypesRes.error;
    if (questionsRes.error) throw questionsRes.error;

    return {
      profile: profileRes.data as AgentBookingProfile | null,
      eventTypes: (eventTypesRes.data ?? []) as BookingEventType[],
      questions: (questionsRes.data ?? []) as BookingQuestion[],
    };
  },

  async saveProfile(profile: AgentBookingProfile): Promise<AgentBookingProfile> {
    const payload = {
      ...profile,
      slug: sanitizeBookingSlug(profile.slug),
    };
    const { data, error } = await supabase
      .from('agent_booking_profiles')
      .upsert(payload, { onConflict: 'agent_id' })
      .select()
      .single();

    if (error) throw error;
    return data as AgentBookingProfile;
  },

  async replaceEventTypes(agentId: string, eventTypes: Array<Partial<BookingEventType> & { label: string; duration_minutes: number }>): Promise<BookingEventType[]> {
    const { error: deleteError } = await supabase
      .from('booking_event_types')
      .delete()
      .eq('agent_id', agentId);
    if (deleteError) throw deleteError;

    const payload = eventTypes.map((eventType, index) => ({
      agent_id: agentId,
      label: eventType.label.trim(),
      duration_minutes: Number(eventType.duration_minutes),
      buffer_before_minutes: Number(eventType.buffer_before_minutes ?? 0),
      buffer_after_minutes: Number(eventType.buffer_after_minutes ?? 15),
      enabled: eventType.enabled ?? true,
      sort_order: index,
    }));

    if (payload.length === 0) return [];

    const { data, error } = await supabase
      .from('booking_event_types')
      .insert(payload)
      .select()
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BookingEventType[];
  },

  async replaceQuestions(agentId: string, questions: Array<Partial<BookingQuestion> & { prompt: string; question_type: BookingQuestionType }>): Promise<BookingQuestion[]> {
    const { error: deleteError } = await supabase
      .from('booking_questions')
      .delete()
      .eq('agent_id', agentId);
    if (deleteError) throw deleteError;

    const payload = questions.map((question, index) => ({
      agent_id: agentId,
      prompt: question.prompt.trim(),
      question_type: question.question_type,
      required: question.required ?? false,
      options: question.options ?? null,
      enabled: question.enabled ?? true,
      sort_order: index,
    }));

    if (payload.length === 0) return [];

    const { data, error } = await supabase
      .from('booking_questions')
      .insert(payload)
      .select()
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as BookingQuestion[];
  },
};
