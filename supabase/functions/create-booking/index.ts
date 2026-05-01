import {
  addMinutes,
  corsHeaders,
  dayOfWeekInZone,
  getCalendarBusyEvents,
  getGoogleAccessToken,
  jsonResponse,
  loadBookingContext,
  overlaps,
  parseJsonRequest,
  serviceClient,
  zonedTimeToUtc,
} from '../_shared/booking.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendConfirmationEmail(params: {
  to: string;
  agentEmail?: string;
  agentName?: string;
  propertyAddress?: string;
  startsAt: string;
  timezone: string;
}) {
  if (!RESEND_API_KEY || !EMAIL_REGEX.test(params.to)) return;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: params.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(params.startsAt));
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <p>Your tour is confirmed for ${escapeHtml(time)}.</p>
      ${params.propertyAddress ? `<p><strong>Requested property:</strong> ${escapeHtml(params.propertyAddress)}</p>` : ''}
      <p>${escapeHtml(params.agentName || 'The agent')} will meet you then.</p>
    </div>
  `;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${params.agentName || 'OpenQ'} <noreply@openqapp.xyz>`,
      to: [params.to],
      reply_to: params.agentEmail,
      subject: `Tour confirmed${params.propertyAddress ? `: ${params.propertyAddress}` : ''}`,
      html,
    }),
  }).catch((error) => console.error('[create-booking] confirmation email failed:', error));
}

async function selectedSlotIsAvailable(context: any, eventType: any, selectedStart: Date, accessToken: string): Promise<boolean> {
  const timezone = context.profile.timezone;
  const selectedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(selectedStart);
  const day = dayOfWeekInZone(zonedTimeToUtc(selectedDate, '12:00', timezone), timezone);
  const windows = (context.profile.working_hours ?? []).filter((window: any) => Number(window.day) === day);
  const duration = Number(eventType.duration_minutes);
  const bufferBefore = Number(eventType.buffer_before_minutes ?? context.profile.default_buffer_before_minutes ?? 0);
  const bufferAfter = Number(eventType.buffer_after_minutes ?? context.profile.default_buffer_after_minutes ?? 0);
  const selectedEnd = addMinutes(selectedStart, duration);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const horizonEndDate = new Date(`${today}T00:00:00Z`);
  horizonEndDate.setUTCDate(horizonEndDate.getUTCDate() + Number(context.profile.default_booking_horizon_days));
  const horizonEnd = zonedTimeToUtc(horizonEndDate.toISOString().slice(0, 10), '23:59', timezone);
  if (selectedStart > horizonEnd) return false;
  const withinWindow = windows.some((window: any) => {
    const windowStart = zonedTimeToUtc(selectedDate, window.start, timezone);
    const windowEnd = zonedTimeToUtc(selectedDate, window.end, timezone);
    return selectedStart >= windowStart && selectedEnd <= windowEnd;
  });
  if (!withinWindow) return false;
  if (selectedStart < addMinutes(new Date(), Number(context.profile.minimum_notice_minutes))) return false;

  const busy = await getCalendarBusyEvents(
    accessToken,
    addMinutes(selectedStart, -bufferBefore),
    addMinutes(selectedEnd, bufferAfter),
  );
  return !busy.some((event) => overlaps(addMinutes(selectedStart, -bufferBefore), addMinutes(selectedEnd, bufferAfter), event.start, event.end));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const body = await parseJsonRequest(req);
    const {
      slug,
      request,
      eventTypeId,
      start,
      prospectName,
      prospectEmail,
      prospectPhone,
      questionResponses = [],
    } = body;
    if (!slug || !eventTypeId || !start || !prospectName || !prospectEmail) {
      return jsonResponse({ success: false, error: 'Missing required booking fields' }, 400);
    }
    if (!EMAIL_REGEX.test(prospectEmail)) {
      return jsonResponse({ success: false, error: 'Invalid prospect email' }, 400);
    }

    const supabase = serviceClient();
    const context = await loadBookingContext(supabase, slug, request);
    if ('error' in context) return jsonResponse({ success: false, error: context.error }, 404);
    if (!context.connection) return jsonResponse({ success: false, error: 'calendar_not_connected' }, 409);

    const eventType = context.eventTypes.find((item: any) => item.id === eventTypeId);
    if (!eventType) return jsonResponse({ success: false, error: 'event_type_not_found' }, 404);

    const responsesByQuestion = new Map<string, unknown>(
      (questionResponses as any[]).map((response) => [response.questionId, response.answer]),
    );
    for (const question of context.questions) {
      if (question.required && !responsesByQuestion.has(question.id)) {
        return jsonResponse({ success: false, error: `Missing required answer: ${question.prompt}` }, 400);
      }
    }

    const accessToken = await getGoogleAccessToken(context.connection);
    const selectedStart = new Date(start);
    if (Number.isNaN(selectedStart.getTime())) {
      return jsonResponse({ success: false, error: 'Invalid start time' }, 400);
    }

    const available = await selectedSlotIsAvailable(context, eventType, selectedStart, accessToken);
    if (!available) {
      return jsonResponse({ success: false, error: 'slot_unavailable' }, 409);
    }

    const selectedEnd = addMinutes(selectedStart, Number(eventType.duration_minutes));
    const bookingId = crypto.randomUUID();
    const propertyAddress = context.tourRequest?.property_address ?? null;
    const source = context.tourRequest?.source ?? null;
    const answers = context.questions
      .filter((question: any) => responsesByQuestion.has(question.id))
      .map((question: any) => `${question.prompt}: ${String(responsesByQuestion.get(question.id))}`)
      .join('\n');

    const description = [
      `OpenQ booking id: ${bookingId}`,
      propertyAddress ? `Original inquiry: ${propertyAddress}` : null,
      source ? `Source: ${source}` : null,
      `Prospect: ${prospectName}`,
      `Email: ${prospectEmail}`,
      prospectPhone ? `Phone: ${prospectPhone}` : null,
      answers ? `\nIntake answers:\n${answers}` : null,
    ].filter(Boolean).join('\n');

    const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `Tour: ${prospectName}${propertyAddress ? ` - ${propertyAddress}` : ''}`,
        location: propertyAddress || undefined,
        description,
        start: { dateTime: selectedStart.toISOString(), timeZone: context.profile.timezone },
        end: { dateTime: selectedEnd.toISOString(), timeZone: context.profile.timezone },
        attendees: [{ email: prospectEmail, displayName: prospectName }],
      }),
    });

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('[create-booking] Calendar insert failed:', calendarResponse.status, errorText);
      const status = calendarResponse.status === 403 ? 403 : 500;
      return jsonResponse({ success: false, error: calendarResponse.status === 403 ? 'calendar_scope_missing' : 'calendar_insert_failed' }, status);
    }

    const calendarEvent = await calendarResponse.json();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        id: bookingId,
        agent_id: context.profile.agent_id,
        tour_request_id: context.tourRequest?.id ?? null,
        event_type_id: eventType.id,
        prospect_name: prospectName,
        prospect_email: prospectEmail,
        prospect_phone: prospectPhone || null,
        property_address: propertyAddress,
        source,
        starts_at: selectedStart.toISOString(),
        ends_at: selectedEnd.toISOString(),
        timezone: context.profile.timezone,
        status: 'confirmed',
        google_calendar_event_id: calendarEvent.id,
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    const responseRows = (questionResponses as any[])
      .filter((response) => response.questionId)
      .map((response) => ({
        booking_id: bookingId,
        question_id: response.questionId,
        answer: response.answer,
      }));
    if (responseRows.length > 0) {
      const { error } = await supabase.from('booking_question_responses').insert(responseRows);
      if (error) throw error;
    }

    await sendConfirmationEmail({
      to: prospectEmail,
      agentEmail: context.agent?.email ?? undefined,
      agentName: context.agent?.name ?? undefined,
      propertyAddress: propertyAddress ?? undefined,
      startsAt: selectedStart.toISOString(),
      timezone: context.profile.timezone,
    });

    return jsonResponse({ success: true, booking, calendarEventId: calendarEvent.id });
  } catch (error) {
    console.error('[create-booking] Error:', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});
