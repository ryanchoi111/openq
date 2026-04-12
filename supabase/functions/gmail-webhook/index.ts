/**
 * Gmail Webhook Edge Function
 *
 * Receives Google Cloud Pub/Sub push notifications when new emails arrive
 * in a monitored Gmail account. Detects tour request emails from Zillow
 * and StreetEasy, parses client info, and stores them.
 *
 * CRITICAL: Must respond within 1 second. Processing happens async.
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

// --- Email Parser ---

type EmailSource = 'zillow' | 'streeteasy';

interface ParsedTourEmail {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
  source: EmailSource;
}

/**
 * Detect which tour-request source an email is from (if any).
 * Returns the source or null if it's not a recognized tour email.
 */
function detectEmailSource(
  headers: { name: string; value: string }[],
  body: string
): EmailSource | null {
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value?.toLowerCase() ?? '';
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value?.toLowerCase() ?? '';
  const bodyLower = body.toLowerCase();

  // StreetEasy: from noreply@email.streeteasy.com, subject contains "streeteasy inquiry from"
  if (from.includes('noreply@email.streeteasy.com') && subject.includes('streeteasy inquiry from')) {
    return 'streeteasy';
  }

  // Zillow direct: from rentalclientservices@zillowrentals.com
  const isZillowFrom = from.includes('rentalclientservices@zillowrentals.com');
  const isZillowSubject = subject.includes('new zillow group rentals contact:');
  const hasTourKeyword = bodyLower.includes('tour') || bodyLower.includes('schedule a tour');

  if (isZillowFrom && isZillowSubject && hasTourKeyword) return 'zillow';

  // Forwarded Zillow
  const isForwarded = subject.includes('fwd:') || subject.includes('fw:');
  const bodyHasZillow =
    bodyLower.includes('rentalclientservices@zillowrentals.com') ||
    bodyLower.includes('zillow group rentals');

  if (isForwarded && bodyHasZillow && hasTourKeyword) return 'zillow';

  return null;
}

// --- StreetEasy parser ---

/**
 * Parse StreetEasy tour request email.
 *
 * Subject format: "<Address> StreetEasy Inquiry From <Name>"
 * Body contains: "{Name} Has Requested a Tour for {Address}"
 * Contact line: "{Name} | {email} | {phone}"  (pipe-separated)
 */
function parseStreetEasyEmail(
  headers: { name: string; value: string }[],
  body: string
): ParsedTourEmail | null {
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';

  // Extract name + address from subject
  // e.g. "165 East 35th Street #12J StreetEasy Inquiry From Pablo Pigorini"
  const subjectMatch = subject.match(/^(.+?)\s+StreetEasy\s+Inquiry\s+From\s+(.+)$/i);

  let clientName = '';
  let propertyAddress = '';

  if (subjectMatch) {
    propertyAddress = subjectMatch[1].trim();
    clientName = subjectMatch[2].trim();
  } else {
    // Fallback: try body for "Has Requested a Tour for <address>"
    const bodyNameAddr = body.match(/(.+?)\s+Has Requested a Tour for\s+(.+)/i);
    if (bodyNameAddr) {
      clientName = bodyNameAddr[1].trim();
      propertyAddress = bodyNameAddr[2].trim();
    }
  }

  if (!clientName) return null;

  // Extract email from body (standalone email address)
  const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  // Extract phone: +13476011118 or similar patterns
  const phoneMatch = body.match(/(\+?\d{10,})/);

  return {
    clientName,
    clientEmail: emailMatch?.[1] ?? '',
    clientPhone: phoneMatch?.[1],
    propertyAddress,
    source: 'streeteasy',
  };
}

// --- Zillow parser ---

/**
 * Extract property address from Zillow subject line.
 * Format: "New Zillow Group Rentals Contact: <Address>"
 */
function extractZillowAddressFromSubject(subject: string): string | null {
  const match = subject.match(/New Zillow Group Rentals Contact:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Parse Zillow email body to extract client info.
 */
function parseZillowEmail(body: string): ParsedTourEmail | null {
  // Try structured format (Name: ..., Email: ..., Property: ...)
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
        source: 'zillow',
      };
    }
  }

  // "New Contact" format: "New Contact Ryan Choi says:"
  const nameMatch = body.match(/New Contact\s+(.+?)\s+says:/i);
  const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = body.match(/(\d{3}[.\-)\s]+\d{3}[.\-\s]+\d{4})/);
  const addressMatch = body.match(/(\d+\s+[\w\s]+(?:#\w+)?[,\s]+\w[\w\s]+,\s*[A-Z]{2})/);

  if (!nameMatch || !emailMatch) return null;

  return {
    clientName: nameMatch[1].trim(),
    clientEmail: emailMatch[1].trim(),
    clientPhone: phoneMatch?.[1]?.trim(),
    propertyAddress: addressMatch?.[1]?.trim() || '',
    source: 'zillow',
  };
}

/**
 * Extract plain text body from a Gmail message payload.
 * Handles both simple and multipart MIME structures.
 */
function getEmailBody(payload: any): string {
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      if (part.parts) {
        const nested = getEmailBody(part);
        if (nested) return nested;
      }
    }
    // Fallback to text/html stripped of tags
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return '';
}

// --- Gmail API helpers ---

interface OAuthTokens {
  access_token: string;
  expires_in: number;
  token_type: string;
}

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

async function fetchNewMessages(accessToken: string, historyId: string): Promise<string[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    console.warn('History ID expired, no messages returned');
    return [];
  }
  if (response.status === 401) throw new AuthError('Access token expired');
  if (response.status === 429) throw new Error('Gmail API rate limited');
  if (!response.ok) {
    throw new Error(`Gmail history API error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.history) return [];

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

async function fetchMessage(accessToken: string, messageId: string): Promise<any> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new AuthError('Access token expired');
  if (!response.ok) throw new Error(`Gmail message fetch error (${response.status})`);

  return response.json();
}

// --- Webhook handler ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const pubsubMessage = await req.json();

    const data = pubsubMessage?.message?.data;
    if (!data) {
      console.error('No data in Pub/Sub message');
      return new Response('OK', { status: 200 });
    }

    const decoded = JSON.parse(atob(data));
    const emailAddress: string = decoded.emailAddress;
    const historyId: string = String(decoded.historyId);

    if (!emailAddress || !historyId) {
      console.error('Missing emailAddress or historyId in notification');
      return new Response('OK', { status: 200 });
    }

    console.log(`[Gmail Webhook] Notification for ${emailAddress}, historyId: ${historyId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseServiceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not set');
      return new Response('OK', { status: 200 });
    }

    // Look up agent connection
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

    let messageIds: string[];
    try {
      messageIds = await fetchNewMessages(accessToken, lastHistoryId);
    } catch (err) {
      if (err instanceof AuthError) {
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

    const tourResults: any[] = [];

    for (const msgId of messageIds) {
      try {
        const message = await fetchMessage(accessToken, msgId);
        const headers = message.payload?.headers || [];
        const body = getEmailBody(message.payload);
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value ?? '';
        const receivedAt = new Date(parseInt(message.internalDate)).toISOString();

        const source = detectEmailSource(headers, body);
        if (!source) continue;

        let parsed: ParsedTourEmail | null = null;

        if (source === 'streeteasy') {
          parsed = parseStreetEasyEmail(headers, body);
        } else if (source === 'zillow') {
          parsed = parseZillowEmail(body);
        }

        if (parsed) {
          // For Zillow, fall back to subject-extracted address if body parse missed it
          if (source === 'zillow' && !parsed.propertyAddress) {
            parsed.propertyAddress = extractZillowAddressFromSubject(subject) || subject;
          }
          tourResults.push({
            ...parsed,
            rawSubject: subject,
            receivedAt,
            gmailMessageId: msgId,
            agentEmail: emailAddress,
          });
          console.log(`[Gmail Webhook] ${source} email parsed:`, {
            client: parsed.clientName,
            property: parsed.propertyAddress,
          });
        } else {
          // Fallback: store with whatever we can extract
          const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value ?? '';
          const fallbackAddress =
            source === 'zillow'
              ? extractZillowAddressFromSubject(subject) || subject
              : subject;
          tourResults.push({
            clientName: `${source === 'zillow' ? 'Zillow' : 'StreetEasy'} Lead`,
            clientEmail: fromHeader,
            clientPhone: undefined,
            propertyAddress: fallbackAddress,
            source,
            rawSubject: subject,
            receivedAt,
            gmailMessageId: msgId,
            agentEmail: emailAddress,
          });
          console.log(`[Gmail Webhook] ${source} email stored (fallback):`, { subject });
        }
      } catch (parseErr) {
        console.error(`[Gmail Webhook] Error processing message ${msgId}:`, parseErr);
      }
    }

    // Update historyId
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

    // Store parsed tour requests
    if (tourResults.length > 0) {
      const records = tourResults.map((r) => ({
        agent_id: connection.agent_id,
        gmail_message_id: r.gmailMessageId,
        client_name: r.clientName,
        client_email: r.clientEmail,
        client_phone: r.clientPhone || null,
        property_address: r.propertyAddress,
        raw_subject: r.rawSubject,
        received_at: r.receivedAt,
        source: r.source,
      }));

      const { error: insertErr } = await fetch(
        `${supabaseUrl}/rest/v1/tour_requests`,
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
        console.error('Error inserting tour requests:', insertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messagesProcessed: messageIds.length,
        tourEmailsFound: tourResults.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Gmail Webhook] Unhandled error:', error);
    return new Response('OK', { status: 200 });
  }
});
