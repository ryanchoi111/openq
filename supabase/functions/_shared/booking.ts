import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
export const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export function parseJsonRequest(req: Request): Promise<any> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    return Promise.resolve(Object.fromEntries(url.searchParams.entries()));
  }
  return req.json();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function offsetMinutesForUtc(utcDate: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(utcDate);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const offset = offsetMinutesForUtc(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000;
  }
  return new Date(utcMs);
}

export function formatDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function dayOfWeekInZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

export function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function getGoogleAccessToken(connection: any): Promise<string> {
  const oauthClientId = connection.oauth_client_id || GOOGLE_CLIENT_ID;
  const isNativeClient = oauthClientId !== GOOGLE_CLIENT_ID;
  const tokenParams: Record<string, string> = {
    client_id: oauthClientId,
    refresh_token: connection.refresh_token,
    grant_type: 'refresh_token',
  };
  if (!isNativeClient) tokenParams.client_secret = GOOGLE_CLIENT_SECRET;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenParams),
  });

  if (!response.ok) {
    throw new Error('token_refresh_failed');
  }

  const tokens = await response.json();
  return tokens.access_token;
}

export async function getCalendarBusyEvents(accessToken: string, timeMin: Date, timeMax: Date): Promise<Array<{ start: Date; end: Date }>> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 403) throw new Error('calendar_scope_missing');
    throw new Error('calendar_events_failed');
  }

  const data = await response.json();
  return (data.items ?? [])
    .filter((item: any) => item.status !== 'cancelled')
    .map((item: any) => ({
      start: new Date(item.start?.dateTime ?? `${item.start?.date}T00:00:00Z`),
      end: new Date(item.end?.dateTime ?? `${item.end?.date}T23:59:59Z`),
    }));
}

export async function loadBookingContext(supabase: ReturnType<typeof serviceClient>, slug: string, requestId?: string) {
  const { data: profile, error: profileError } = await supabase
    .from('agent_booking_profiles')
    .select('*')
    .eq('slug', slug)
    .eq('booking_enabled', true)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { error: 'booking_profile_not_found' };

  const [agentRes, eventTypesRes, questionsRes, connectionRes] = await Promise.all([
    supabase.from('users').select('id, name, email').eq('id', profile.agent_id).maybeSingle(),
    supabase.from('booking_event_types').select('*').eq('agent_id', profile.agent_id).eq('enabled', true).order('sort_order'),
    supabase.from('booking_questions').select('*').eq('agent_id', profile.agent_id).eq('enabled', true).order('sort_order'),
    supabase.from('agent_gmail_connections').select('*').eq('agent_id', profile.agent_id).maybeSingle(),
  ]);

  if (agentRes.error) throw agentRes.error;
  if (eventTypesRes.error) throw eventTypesRes.error;
  if (questionsRes.error) throw questionsRes.error;
  if (connectionRes.error) throw connectionRes.error;

  let tourRequest = null;
  if (requestId) {
    const { data, error } = await supabase
      .from('tour_requests')
      .select('*')
      .eq('id', requestId)
      .eq('agent_id', profile.agent_id)
      .maybeSingle();
    if (error) throw error;
    tourRequest = data;
  }

  return {
    profile,
    agent: agentRes.data,
    eventTypes: eventTypesRes.data ?? [],
    questions: questionsRes.data ?? [],
    connection: connectionRes.data,
    tourRequest,
  };
}
