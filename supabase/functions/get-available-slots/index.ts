import {
  addMinutes,
  corsHeaders,
  datesBetween,
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

function clampDateRange(dateFrom: string | undefined, dateTo: string | undefined, horizonDays: number, timezone: string) {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + horizonDays);
  const maxDate = max.toISOString().slice(0, 10);
  const start = dateFrom && dateFrom > today ? dateFrom : today;
  const end = dateTo && dateTo < maxDate ? dateTo : maxDate;
  return { start, end };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const { slug, request, eventTypeId, dateFrom, dateTo } = await parseJsonRequest(req);
    if (!slug || !eventTypeId) {
      return jsonResponse({ success: false, error: 'slug and eventTypeId are required' }, 400);
    }

    const context = await loadBookingContext(serviceClient(), slug, request);
    if ('error' in context) return jsonResponse({ success: false, error: context.error }, 404);
    if (!context.connection) return jsonResponse({ success: false, error: 'calendar_not_connected' }, 409);

    const eventType = context.eventTypes.find((item: any) => item.id === eventTypeId);
    if (!eventType) return jsonResponse({ success: false, error: 'event_type_not_found' }, 404);

    const timezone = context.profile.timezone;
    const { start, end } = clampDateRange(dateFrom, dateTo, context.profile.default_booking_horizon_days, timezone);
    const rangeStart = zonedTimeToUtc(start, '00:00', timezone);
    const rangeEnd = zonedTimeToUtc(end, '23:59', timezone);
    const accessToken = await getGoogleAccessToken(context.connection);
    const busy = await getCalendarBusyEvents(accessToken, rangeStart, rangeEnd);

    const nowWithNotice = addMinutes(new Date(), context.profile.minimum_notice_minutes);
    const duration = Number(eventType.duration_minutes);
    const bufferBefore = Number(eventType.buffer_before_minutes ?? context.profile.default_buffer_before_minutes ?? 0);
    const bufferAfter = Number(eventType.buffer_after_minutes ?? context.profile.default_buffer_after_minutes ?? 0);
    const increment = Number(context.profile.slot_increment_minutes);
    const slots: Array<{ start: string; end: string; label: string }> = [];

    for (const date of datesBetween(start, end)) {
      const day = dayOfWeekInZone(zonedTimeToUtc(date, '12:00', timezone), timezone);
      const windows = (context.profile.working_hours ?? []).filter((window: any) => Number(window.day) === day);
      for (const window of windows) {
        let cursor = zonedTimeToUtc(date, window.start, timezone);
        const windowEnd = zonedTimeToUtc(date, window.end, timezone);
        while (addMinutes(cursor, duration) <= windowEnd) {
          const slotStart = cursor;
          const slotEnd = addMinutes(slotStart, duration);
          const blockedStart = addMinutes(slotStart, -bufferBefore);
          const blockedEnd = addMinutes(slotEnd, bufferAfter);
          const conflicts = busy.some((event) => overlaps(blockedStart, blockedEnd, event.start, event.end));
          if (slotStart >= nowWithNotice && !conflicts) {
            slots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              label: new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }).format(slotStart),
            });
          }
          cursor = addMinutes(cursor, increment);
        }
      }
    }

    return jsonResponse({ success: true, timezone, slots });
  } catch (error) {
    console.error('[get-available-slots] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'calendar_scope_missing' ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
