import { corsHeaders, jsonResponse, loadBookingContext, parseJsonRequest, serviceClient } from '../_shared/booking.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const { slug, request } = await parseJsonRequest(req);
    if (!slug) return jsonResponse({ success: false, error: 'slug is required' }, 400);

    const context = await loadBookingContext(serviceClient(), slug, request);
    if ('error' in context) {
      return jsonResponse({ success: false, error: context.error }, 404);
    }

    if (!context.connection) {
      return jsonResponse({ success: false, error: 'calendar_not_connected' }, 409);
    }

    return jsonResponse({
      success: true,
      profile: {
        slug: context.profile.slug,
        timezone: context.profile.timezone,
        bookingHorizonDays: context.profile.default_booking_horizon_days,
        minimumNoticeMinutes: context.profile.minimum_notice_minutes,
      },
      agent: {
        name: context.agent?.name,
        email: context.agent?.email,
      },
      eventTypes: context.eventTypes.map((eventType: any) => ({
        id: eventType.id,
        label: eventType.label,
        durationMinutes: eventType.duration_minutes,
      })),
      questions: context.questions.map((question: any) => ({
        id: question.id,
        prompt: question.prompt,
        type: question.question_type,
        required: question.required,
        options: question.options,
      })),
      requestContext: context.tourRequest
        ? {
            id: context.tourRequest.id,
            clientName: context.tourRequest.client_name,
            clientEmail: context.tourRequest.client_email,
            clientPhone: context.tourRequest.client_phone,
            propertyAddress: context.tourRequest.property_address,
            source: context.tourRequest.source,
          }
        : null,
    });
  } catch (error) {
    console.error('[get-public-booking-profile] Error:', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});
