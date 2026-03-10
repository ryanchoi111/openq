/**
 * Gmail Webhook Edge Function
 *
 * Receives Google Cloud Pub/Sub push notifications when new emails arrive
 * in a monitored Gmail account. Fetches the email, checks if it's from
 * Zillow, and parses tour request data.
 *
 * CRITICAL: Must respond within 1 second. Processing happens async.
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

// --- Email Parser ---

interface ParsedZillowEmail {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
}

/**
 * Check if a Gmail message is from Zillow based on From/Subject headers.
 */
function isZillowEmail(headers: { name: string; value: string }[], body: string): boolean {
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value?.toLowerCase() ?? '';
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value?.toLowerCase() ?? '';

  const bodyLower = body.toLowerCase();
  const fromMatch = from.includes('rentalclientservices@zillowrentals.com');
  const subjectMatch = subject.includes('new zillow group rentals contact:');
  const bodyMatch = bodyLower.includes('tour') || bodyLower.includes('schedule a tour');

  // Direct Zillow email
  if (fromMatch && subjectMatch && bodyMatch) return true;

  // Forwarded Zillow email
  const isForwarded = subject.includes('fwd:') || subject.includes('fw:');
  const bodyHasZillow = bodyLower.includes('rentalclientservices@zillowrentals.com') || bodyLower.includes('zillow group rentals');

  return isForwarded && bodyHasZillow && bodyMatch;
}

/**
 * Extract property address from Zillow subject line.
 * Format: "New Zillow Group Rentals Contact: <Address>"
 */
function extractAddressFromSubject(subject: string): string | null {
  const match = subject.match(/New Zillow Group Rentals Contact:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Extract plain text body from a Gmail message payload.
 * Handles both simple and multipart MIME structures.
 */
function getEmailBody(payload: any): string {
  // Simple message with body data directly
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  // Multipart message — find text/plain part
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      // Recurse into nested multipart
      if (part.parts) {
        const nested = getEmailBody(part);
        if (nested) return nested;
      }
    }
    // Fallback to text/html if no text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return '';
}

/**
 * Parse Zillow email body to extract client info.
 * Returns null if required fields are missing.
 */
function parseZillowEmail(body: string): ParsedZillowEmail | null {
  // Try original format first (Name: ..., Email: ..., Property: ...)
  const nameMatchOld = body.match(/Name:\s*(.+)/i);
  const emailMatchOld = body.match(/Email:\s*([^\s]+@[^\s]+)/i);
  const propertyMatchOld = body.match(/(?:Property|Address):\s*(.+)/i);

  if (nameMatchOld && emailMatchOld && propertyMatchOld) {
    const clientEmail = emailMatchOld[1].trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      const phoneMatchOld = body.match(/Phone:\s*(.+)/i);
      return {
        clientName: nameMatchOld[1].trim(),
        clientEmail,
        clientPhone: phoneMatchOld?.[1]?.trim(),
        propertyAddress: propertyMatchOld[1].trim(),
      };
    }
  }

  // Zillow Rentals "New Contact" format
  // Name: "Ryan Choi says:" after "New Contact"
  const nameMatch = body.match(/New Contact\s+(.+?)\s+says:/i);
  // Email: standalone email in body
  const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  // Phone: pattern like 617.879.8838 or (555) 123-4567
  const phoneMatch = body.match(/(\d{3}[.\-)\s]+\d{3}[.\-\s]+\d{4})/);
  // Address: line after "Your listing" section, look for street address pattern
  const addressMatch = body.match(/(\d+\s+[\w\s]+(?:#\w+)?[,\s]+\w[\w\s]+,\s*[A-Z]{2})/);

  if (!nameMatch || !emailMatch) {
    return null;
  }

  return {
    clientName: nameMatch[1].trim(),
    clientEmail: emailMatch[1].trim(),
    clientPhone: phoneMatch?.[1]?.trim(),
    propertyAddress: addressMatch?.[1]?.trim() || '',
  };
}

// --- Gmail API helpers ---

interface OAuthTokens {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Exchange a refresh token for a fresh access token.
 */
async function getAccessToken(refreshToken: string, oauthClientId?: string): Promise<string> {
  const clientId = oauthClientId || GOOGLE_CLIENT_ID;
  const isNativeClient = clientId !== GOOGLE_CLIENT_ID;

  const params: Record<string, string> = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };
  if (!isNativeClient) {
    params.client_secret = GOOGLE_CLIENT_SECRET;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401 || response.status === 400) {
      throw new AuthError(`Token refresh failed: ${err}`);
    }
    throw new Error(`Token refresh failed (${response.status}): ${err}`);
  }

  const data: OAuthTokens = await response.json();
  return data.access_token;
}

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Fetch new messages since a given historyId using Gmail history API.
 */
async function fetchNewMessages(
  accessToken: string,
  historyId: string
): Promise<string[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    // historyId too old, need full sync — return empty for now
    console.warn('History ID expired, no messages returned');
    return [];
  }

  if (response.status === 401) {
    throw new AuthError('Access token expired');
  }

  if (response.status === 429) {
    throw new Error('Gmail API rate limited');
  }

  if (!response.ok) {
    throw new Error(`Gmail history API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.history) return [];

  // Collect unique message IDs from history
  const messageIds = new Set<string>();
  for (const entry of data.history) {
    if (entry.messagesAdded) {
      for (const msg of entry.messagesAdded) {
        messageIds.add(msg.message.id);
      }
    }
  }

  return Array.from(messageIds);
}

/**
 * Fetch full message details from Gmail API.
 */
async function fetchMessage(accessToken: string, messageId: string): Promise<any> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new AuthError('Access token expired');
  }

  if (!response.ok) {
    throw new Error(`Gmail message fetch error (${response.status})`);
  }

  return response.json();
}

// --- Webhook handler ---

Deno.serve(async (req: Request) => {
  // Must respond quickly — Pub/Sub requires ack within 10s
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const pubsubMessage = await req.json();

    // Decode Pub/Sub message data
    const data = pubsubMessage?.message?.data;
    if (!data) {
      console.error('No data in Pub/Sub message');
      return new Response('OK', { status: 200 }); // Ack to prevent redelivery
    }

    const decoded = JSON.parse(atob(data));
    const emailAddress: string = decoded.emailAddress;
    const historyId: string = String(decoded.historyId);

    if (!emailAddress || !historyId) {
      console.error('Missing emailAddress or historyId in notification');
      return new Response('OK', { status: 200 });
    }

    console.log(`[Gmail Webhook] Notification for ${emailAddress}, historyId: ${historyId}`);

    // Respond immediately, process in background
    // Note: In Deno Deploy/Supabase Edge Functions, we can do async work
    // after responding, but the function may be killed. Instead, we process
    // synchronously but keep it fast.

    // Look up agent's refresh token and last historyId from Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseServiceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not set');
      return new Response('OK', { status: 200 });
    }

    // Use service role to query agent_gmail_connections
    const connResponse = await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?email=eq.${encodeURIComponent(emailAddress)}&select=*`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!connResponse.ok) {
      console.error('Failed to look up agent connection:', await connResponse.text());
      return new Response('OK', { status: 200 });
    }

    const connections = await connResponse.json();
    if (!connections || connections.length === 0) {
      console.warn(`No agent connection found for ${emailAddress}`);
      return new Response('OK', { status: 200 });
    }

    const connection = connections[0];
    const lastHistoryId = connection.history_id || historyId;

    let accessToken: string;
    try {
      accessToken = await getAccessToken(connection.refresh_token, connection.oauth_client_id);
    } catch (err) {
      if (err instanceof AuthError) {
        // Mark agent as needing re-auth
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
        console.error(`Agent ${emailAddress} needs re-auth:`, err.message);
      }
      return new Response('OK', { status: 200 });
    }

    // Fetch new message IDs since last historyId
    let messageIds: string[];
    try {
      messageIds = await fetchNewMessages(accessToken, lastHistoryId);
    } catch (err) {
      if (err instanceof AuthError) {
        // Mark needs_reauth
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
        return new Response('OK', { status: 200 });
      }
      throw err;
    }

    console.log(`[Gmail Webhook] Found ${messageIds.length} new messages for ${emailAddress}`);

    const zillowResults: any[] = [];

    // Process each message
    for (const msgId of messageIds) {
      try {
        const message = await fetchMessage(accessToken, msgId);
        const headers = message.payload?.headers || [];
        const body = getEmailBody(message.payload);

        if (!isZillowEmail(headers, body)) continue;

        const parsed = parseZillowEmail(body);
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value ?? '';
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value ?? '';
        const receivedAt = new Date(parseInt(message.internalDate)).toISOString();
        const addressFromSubject = extractAddressFromSubject(subject);

        if (parsed) {
          const result = {
            ...parsed,
            propertyAddress: parsed.propertyAddress || addressFromSubject || subject,
            rawSubject: subject,
            receivedAt,
            gmailMessageId: msgId,
            agentEmail: emailAddress,
          };
          zillowResults.push(result);
          console.log(`[Gmail Webhook] Zillow email parsed:`, {
            client: parsed.clientName,
            property: result.propertyAddress,
          });
        } else {
          // Fallback: extract address from subject, store with available info
          const result = {
            clientName: 'Zillow Lead',
            clientEmail: fromHeader,
            clientPhone: undefined,
            propertyAddress: addressFromSubject || subject,
            rawSubject: subject,
            receivedAt,
            gmailMessageId: msgId,
            agentEmail: emailAddress,
          };
          zillowResults.push(result);
          console.log(`[Gmail Webhook] Zillow email stored (fallback):`, { subject });
        }
      } catch (parseErr) {
        // Never crash on a single email — log and continue
        console.error(`[Gmail Webhook] Error processing message ${msgId}:`, parseErr);
      }
    }

    // Update historyId to latest
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
        body: JSON.stringify({ history_id: historyId }),
      }
    );

    // If Zillow emails found, store them for the agent
    if (zillowResults.length > 0) {
      const records = zillowResults.map((z) => ({
        agent_id: connection.agent_id,
        gmail_message_id: z.gmailMessageId,
        client_name: z.clientName,
        client_email: z.clientEmail,
        client_phone: z.clientPhone || null,
        property_address: z.propertyAddress,
        raw_subject: z.rawSubject,
        received_at: z.receivedAt,
      }));

      const { error: insertErr } = await fetch(
        `${supabaseUrl}/rest/v1/zillow_tour_requests`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=ignore-duplicates',
          },
          body: JSON.stringify(records),
        }
      ).then(async (r) => {
        if (!r.ok) return { error: await r.text() };
        return { error: null };
      });

      if (insertErr) {
        console.error('Error inserting Zillow tour requests:', insertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messagesProcessed: messageIds.length,
        zillowEmailsFound: zillowResults.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Gmail Webhook] Unhandled error:', error);
    // Always return 200 to prevent Pub/Sub redelivery on app errors
    return new Response('OK', { status: 200 });
  }
});
