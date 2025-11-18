import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// To use this function, you need to set the RESEND_API_KEY secret in Supabase Dashboard
// Run: supabase secrets set RESEND_API_KEY=your_resend_api_key_here
// Get your API key from: https://resend.com/api-keys

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

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
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set. Please configure it in Supabase Dashboard.');
    }

    const { recipients, propertyAddress, applicationUrl, agentName, fromEmail }: EmailRequest = await req.json();

    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    // Validate and determine sender email
    // Priority: agent's email > fallback
    const senderEmail = fromEmail || 'noreply@openq.app';
    const senderName = agentName || 'OpenQ';
    
    // Log which email is being used for debugging
    console.log(`Sending emails from: ${senderEmail} (${senderName})`);
    if (!fromEmail) {
      console.warn('Warning: No agent email provided, using fallback address');
    }

    // Send emails to all recipients via Resend
    // Resend allows sending from verified domains - agents can verify their email domains
    // See: https://resend.com/docs/dashboard/domains/introduction
    const results = await Promise.allSettled(
      recipients.map(async (recipient) => {
        // Build email content with attachment link
        // Convert plain text with HTML tags to proper HTML format
        const emailContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            ${recipient.emailBody.replace(/\n/g, '<br>')}
            ${applicationUrl ? `<br><br><p><strong>Housing Application:</strong> <a href="${applicationUrl}" style="color: #2563eb; text-decoration: none;">Download PDF</a></p>` : ''}
            ${fromEmail ? `<br><br><p style="font-size: 12px; color: #666;">Reply to: <a href="mailto:${fromEmail}" style="color: #2563eb;">${fromEmail}</a></p>` : ''}
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
            reply_to: fromEmail || senderEmail,
            subject: `Housing Application for ${propertyAddress}`,
            html: emailContent,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Failed to send email to ${recipient.email}`;
          try {
            const errorJson = JSON.parse(errorText);
            const errorDetails = errorJson.message || errorMessage;
            
            // Check for domain verification errors
            if (errorDetails.includes('domain') || errorDetails.includes('verification') || errorDetails.includes('not verified')) {
              errorMessage = `Domain verification required: The email domain for ${senderEmail} must be verified in Resend. ${errorDetails}`;
            } else {
              errorMessage = errorDetails;
            }
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

    // Check results
    const successful = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Log detailed results for debugging
    console.log(`Email sending completed: ${successful.length} successful, ${failed.length} failed`);
    if (failed.length > 0) {
      failed.forEach((result, index) => {
        const recipientIndex = results.indexOf(result);
        console.error(`Failed to send to ${recipients[recipientIndex]?.email}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
      });
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
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
        },
        status: 500,
      }
    );
  }
});
