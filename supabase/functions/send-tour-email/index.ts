import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'https://openqapp.xyz',
  'https://www.openqapp.xyz',
];

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

interface TourEmailRequest {
  to: string;
  subject: string;
  emailBody: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Missing Authorization header' }, 401, origin);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: authData, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !authData.user) {
      return jsonResponse({ success: false, error: 'Invalid session' }, 401, origin);
    }
    const callerId = authData.user.id;

    const { data: callerRow, error: callerErr } = await supabaseClient
      .from('users')
      .select('name, email, role')
      .eq('id', callerId)
      .single();
    if (callerErr || !callerRow) {
      return jsonResponse({ success: false, error: 'User not found' }, 403, origin);
    }
    if (callerRow.role !== 'agent') {
      return jsonResponse({ success: false, error: 'Forbidden: agent role required' }, 403, origin);
    }

    const { to, subject, emailBody }: TourEmailRequest = await req.json();

    if (!to || !subject || !emailBody) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: to, subject, emailBody' },
        400,
        origin,
      );
    }
    if (!EMAIL_REGEX.test(to)) {
      return jsonResponse({ success: false, error: 'Invalid recipient email' }, 400, origin);
    }

    const { data: matched, error: matchErr } = await supabaseClient
      .from('tour_requests')
      .select('id')
      .eq('agent_id', callerId)
      .eq('client_email', to)
      .limit(1)
      .maybeSingle();
    if (matchErr) {
      console.error('[send-tour-email] tour_requests lookup error:', matchErr);
      return jsonResponse({ success: false, error: 'Recipient lookup failed' }, 500, origin);
    }
    if (!matched) {
      return jsonResponse(
        { success: false, error: 'Recipient is not associated with any of your tour requests' },
        403,
        origin,
      );
    }

    const senderName = callerRow.name || 'OpenQ';
    const replyEmail = EMAIL_REGEX.test(callerRow.email ?? '') ? callerRow.email : 'noreply@openqapp.xyz';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        ${escapeHtml(emailBody).replace(/\n/g, '<br>')}
        <br><br><p style="font-size: 12px; color: #666;">Reply to: <a href="mailto:${encodeURIComponent(replyEmail)}" style="color: #2563eb;">${escapeHtml(replyEmail)}</a></p>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@openqapp.xyz>`,
        to: [to],
        reply_to: replyEmail,
        subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[send-tour-email] Resend error:', response.status, errorText);
      let errorMessage = 'Failed to send email';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch {
        errorMessage = `${errorMessage}: ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return jsonResponse({ success: true, messageId: data.id }, 200, origin);
  } catch (error) {
    console.error('[send-tour-email] Error:', error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
});
