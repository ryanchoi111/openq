import { supabase, supabaseUrl } from '../config/supabase';
import type { CalendarEvent } from '../types/calendar';

function calendarErrorMessage(code?: string): string {
  switch (code) {
    case 'no_gmail_connection':
      return 'Connect Google Calendar to see scheduled bookings.';
    case 'token_refresh_failed':
    case 'calendar_scope_missing':
      return 'Please reconnect Google Calendar to keep showing scheduled bookings.';
    case 'invalid_timezone':
    case 'invalid_date_range':
      return 'We could not load bookings for this date. Please try again.';
    default:
      return 'We could not load scheduled bookings. Pull down to refresh or reconnect Google Calendar.';
  }
}

export async function getCalendarEvents(
  agentId: string,
  date: string,
  timezone: string
): Promise<{ events: CalendarEvent[]; needsReauth?: boolean; error?: string }> {
  return getCalendarEventsRange(agentId, date, date, timezone);
}

export async function getCalendarEventsRange(
  agentId: string,
  dateFrom: string,
  dateTo: string,
  timezone: string
): Promise<{ events: CalendarEvent[]; needsReauth?: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { events: [], error: 'Not authenticated' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/get-calendar-events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agentId, dateFrom, dateTo, timezone }),
    });

    const data = await response.json();

    if (!data.success) {
      return {
        events: [],
        needsReauth: data.needsReauth,
        error: calendarErrorMessage(data.error),
      };
    }

    return { events: data.events };
  } catch (error) {
    console.error('Calendar events fetch error:', error);
    return { events: [], error: calendarErrorMessage() };
  }
}
