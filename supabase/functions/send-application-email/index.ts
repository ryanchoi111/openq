import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// To use this function, you need to set the ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY secrets in Supabase Dashboard
// Run: supabase secrets set ONESIGNAL_APP_ID=your_app_id_here
// Run: supabase secrets set ONESIGNAL_REST_API_KEY=your_rest_api_key_here

const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

interface EmailRecipient {
  email: string;
  name: string;
  emailBody: string;
}

interface EmailRequest {
  recipients: EmailRecipient[];
  propertyAddress: string;
  applicationUrl: string;
  agentName: string;
  fromEmail?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      throw new Error('ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not set. Please configure them in Supabase Dashboard.');
    }

    const { recipients, propertyAddress, applicationUrl, agentName, emailBody, fromEmail }: EmailRequest = await req.json();

    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    // Send notifications/emails to all recipients via OneSignal
    const results = await Promise.allSettled(
      recipients.map(async (recipient) => {
        // Build email content with attachment link
        const emailContent = `
          ${recipient.emailBody}
          ${applicationUrl ? `\n\n<p><strong>Housing Application:</strong> <a href="${applicationUrl}">Download PDF</a></p>` : ''}
        `;
        
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            include_email_tokens: [recipient.email],
            email_subject: `Housing Application for ${propertyAddress}`,
            email_body: emailContent,
            email_from_name: agentName || 'OpenQ',
            email_from_address: fromEmail || 'noreply@openq.app', // Uses agent's email if provided, otherwise fallback
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Failed to send email to ${recipient.email}: ${error}`);
        }

        const data = await response.json();
        return {
          recipient: recipient.email,
          messageId: data.id,
          success: true,
        };
      })
    );

    // Check results
    const successful = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        sent: successful.length,
        failed: failed.length,
        results: results.map((r, i) => ({
          recipient: recipients[i].email,
          status: r.status,
          error: r.status === 'rejected' ? r.reason : null,
        })),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 200,
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
          'Access-Control-Allow-Origin': '*',
        },
        status: 500,
      }
    );
  }
});

