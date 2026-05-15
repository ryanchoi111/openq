/**
 * Get Calendar Events Edge Function
 *
 * Fetches Google Calendar events for an agent on a given day or date range.
 * Reuses the Gmail OAuth connection (refresh token) stored in agent_gmail_connections.
 *
 * Expects: { agentId: string, date?: string, dateFrom?: string, dateTo?: string, timezone?: string }
 *   - date: ISO date string (e.g. "2026-04-12"), defaults to today
 *   - dateFrom/dateTo: ISO date strings for a range, capped to 31 days
 *   - timezone: IANA timezone (e.g. "America/New_York"), defaults to UTC
 */

import { zonedTimeToUtc } from '../_shared/booking.ts';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify JWT and extract caller identity
    const jwt = authHeader.replace('Bearer ', '');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': supabaseServiceKey,
      },
    });
    if (!userResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    const authUser = await userResponse.json();

    const { agentId, date, dateFrom, dateTo, timezone } = await req.json();
    if (!agentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'agentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Ensure caller can only access their own calendar
    if (authUser.id !== agentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Look up agent's Gmail connection for refresh token
    const connResponse = await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?agent_id=eq.${agentId}&select=*`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const connections = await connResponse.json();
    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'no_gmail_connection' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const connection = connections[0];

    // Exchange refresh token for access token
    const oauthClientId = connection.oauth_client_id || GOOGLE_CLIENT_ID;
    const isNativeClient = oauthClientId !== GOOGLE_CLIENT_ID;

    const tokenParams: Record<string, string> = {
      client_id: oauthClientId,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    };
    if (!isNativeClient) {
      tokenParams.client_secret = GOOGLE_CLIENT_SECRET;
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      // Mark needs_reauth on token failure
      await fetch(
        `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connection.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ needs_reauth: true }),
        }
      );
      return new Response(
        JSON.stringify({ success: false, error: 'token_refresh_failed', needsReauth: true }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    // Compute day boundaries in the agent's timezone
    const tz = timezone || 'UTC';
    if (!validTimezone(tz)) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_timezone' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    const targetDate = date || new Date().toISOString().split('T')[0];
    const rangeStartDate = dateFrom || targetDate;
    const requestedRangeEndDate = dateTo || targetDate;
    if (!isIsoDate(rangeStartDate) || !isIsoDate(requestedRangeEndDate)) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_date_range' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    const requestedDays = daysBetween(rangeStartDate, requestedRangeEndDate);
    if (requestedDays < 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_date_range' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    const rangeEndDate = requestedDays >= 31
      ? addDaysIso(rangeStartDate, 30)
      : requestedRangeEndDate;
    const rangeStart = zonedTimeToUtc(rangeStartDate, '00:00', tz);
    const rangeEnd = zonedTimeToUtc(addDaysIso(rangeEndDate, 1), '00:00', tz);

    const calendarParams = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      timeZone: tz,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });

    const calendarItems: any[] = [];
    let pageToken: string | undefined;
    do {
      if (pageToken) {
        calendarParams.set('pageToken', pageToken);
      } else {
        calendarParams.delete('pageToken');
      }

      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${calendarParams}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!calendarResponse.ok) {
        const status = calendarResponse.status;
        if (status === 403) {
          // Missing calendar scope — agent needs to re-authenticate
          await fetch(
            `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connection.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ needs_reauth: true }),
            }
          );
          return new Response(
            JSON.stringify({ success: false, error: 'calendar_scope_missing', needsReauth: true }),
            { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
          );
        }
        const errText = await calendarResponse.text();
        console.error(`[Calendar Events] API error (${status}): ${errText}`);
        throw new Error('Failed to fetch calendar events');
      }

      const calendarData = await calendarResponse.json();
      calendarItems.push(...(calendarData.items || []));
      pageToken = calendarData.nextPageToken;
    } while (pageToken);

    const events = calendarItems.map((item: any) => ({
      id: item.id,
      summary: item.summary || '(No title)',
      start: item.start.dateTime || item.start.date,
      end: item.end.dateTime || item.end.date,
      location: item.location || null,
      attendees: (item.attendees || []).map((a: any) => ({
        email: a.email,
        displayName: a.displayName || null,
        responseStatus: a.responseStatus,
      })),
    }));

    return new Response(
      JSON.stringify({ success: true, events }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('[Calendar Events] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});
