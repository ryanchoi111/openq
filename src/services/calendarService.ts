import { supabase, supabaseUrl } from '../config/supabase';
import type { CalendarEvent } from '../types/calendar';

export async function getCalendarEvents(
  agentId: string,
  date: string,
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
      body: JSON.stringify({ agentId, date, timezone }),
    });

    const data = await response.json();

    if (!data.success) {
      return { events: [], needsReauth: data.needsReauth, error: data.error };
    }

    return { events: data.events };
  } catch (error) {
    console.error('Calendar events fetch error:', error);
    return { events: [], error: 'Failed to fetch calendar events' };
  }
}
