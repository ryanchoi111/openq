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
  agentName: string;
  agentEmail: string;
}

/** Escape HTML entities to prevent injection */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

    const { to, subject, emailBody, agentName, agentEmail }: TourEmailRequest = await req.json();

    if (!to || !subject || !emailBody) {
      throw new Error('Missing required fields: to, subject, emailBody');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error('Invalid recipient email');
    }

    const senderName = agentName || 'OpenQ';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        ${escapeHtml(emailBody).replace(/\n/g, '<br>')}
        ${agentEmail ? `<br><br><p style="font-size: 12px; color: #666;">Reply to: <a href="mailto:${escapeHtml(agentEmail)}" style="color: #2563eb;">${escapeHtml(agentEmail)}</a></p>` : ''}
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
        reply_to: agentEmail || 'noreply@openqapp.xyz',
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
    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  } catch (error) {
    console.error('[send-tour-email] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
        status: 500,
      }
    );
  }
});
