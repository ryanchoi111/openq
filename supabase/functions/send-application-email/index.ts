import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Allowed origins for CORS - restrict to your app domains only
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  // TODO: Add your production domain(s) when deploying:
  // 'https://your-app-domain.com',
  // 'exp://192.168.1.3:8081', // Add your development IPs as needed
];

// Helper to get CORS headers with origin validation
const getCorsHeaders = (origin: string | null) => {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

interface EmailRecipient {
  email: string;
  name: string;
  emailBody: string;
  entryId: string;
}

interface EmailRequest {
  eventId: string;
  propertyId: string;
  recipients: EmailRecipient[];
  propertyAddress: string;
  applicationUrl: string;
  agentName: string;
  agentEmail?: string;
}

const MAX_RECIPIENTS = 50;

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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(origin),
    });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set. Please configure it in Supabase Dashboard.');
    }

    // Get Supabase client with auth from request
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      eventId,
      propertyId,
      recipients,
      propertyAddress,
      applicationUrl,
      agentName,
      agentEmail
    }: EmailRequest = await req.json();

    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    if (recipients.length > MAX_RECIPIENTS) {
      throw new Error(`Too many recipients. Maximum is ${MAX_RECIPIENTS}.`);
    }

    if (!eventId || !propertyId) {
      throw new Error('Event ID and Property ID are required');
    }

    const senderEmail = 'noreply@openqapp.xyz';
    const senderName = agentName || 'OpenQ';

    const results = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const emailContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            ${escapeHtml(recipient.emailBody).replace(/\n/g, '<br>')}
            ${applicationUrl ? `<br><br><p><strong>Housing Application:</strong> <a href="${applicationUrl}" style="color: #2563eb; text-decoration: none;">Download PDF</a></p>` : ''}
            ${agentEmail ? `<br><br><p style="font-size: 12px; color: #666;">Reply to: <a href="mailto:${agentEmail}" style="color: #2563eb;">${agentEmail}</a></p>` : ''}
          </div>
        `;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: `${senderName} <${senderEmail}>`,
            to: [recipient.email],
            reply_to: agentEmail || senderEmail,
            subject: `Housing Application for ${propertyAddress}`,
            html: emailContent,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Edge Function] Resend API error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });

          let errorMessage = 'Failed to send email';
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
            console.error(`[Edge Function] Parsed error:`, errorJson);
          } catch {
            errorMessage = `${errorMessage}: ${errorText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        return {
          recipient: recipient.email,
          messageId: data.id,
          success: true,
        };
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Build application records based on actual send results
    const applicationRecords = results.map((result, index) => ({
      event_id: eventId,
      waitlist_entry_id: recipients[index].entryId,
      property_id: propertyId,
      recipient_email: recipients[index].email,
      application_url: applicationUrl,
      status: result.status === 'fulfilled' ? ('sent' as const) : ('failed' as const),
    }));

    // Insert application records with actual statuses
    const { error: insertError } = await supabaseClient
      .from('applications')
      .insert(applicationRecords);

    if (insertError) {
      console.error('Error inserting application records:', insertError);
    }

    // Only update waitlist entries for successful sends
    const successfulEntryIds = results
      .map((result, index) => result.status === 'fulfilled' ? recipients[index].entryId : null)
      .filter((id): id is string => id !== null);

    if (successfulEntryIds.length > 0) {
      const { error: updateError } = await supabaseClient
        .from('waitlist_entries')
        .update({ application_sent: true })
        .in('id', successfulEntryIds);

      if (updateError) {
        console.error('Error updating waitlist entries:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        sent: successful.length,
        failed: failed.length,
        results: results.map((r, i) => ({
          recipient: recipients[i].email,
          status: r.status,
          error: r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null,
        })),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
        status: failed.length === 0 ? 200 : 207, // 207 Multi-Status if some failed
      }
    );
  } catch (error) {
    console.error('Error in send-application-email function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
        status: 500,
      }
    );
  }
});
