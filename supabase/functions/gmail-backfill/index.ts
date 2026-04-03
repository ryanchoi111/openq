/**
 * Gmail Backfill Edge Function
 *
 * Searches historical Gmail messages for tour request emails (Zillow, StreetEasy)
 * that arrived before the Pub/Sub watch was set up. Uses Gmail search API
 * instead of history-based incremental fetch.
 *
 * Expects: { agentId: string, maxResults?: number }
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

// --- Shared types & parsers (mirrored from gmail-webhook) ---

type EmailSource = 'zillow' | 'streeteasy';

interface ParsedTourEmail {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
  source: EmailSource;
}

function detectEmailSource(
  headers: { name: string; value: string }[],
  body: string
): EmailSource | null {
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value?.toLowerCase() ?? '';
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value?.toLowerCase() ?? '';
  const bodyLower = body.toLowerCase();

  if (from.includes('noreply@email.streeteasy.com') && subject.includes('streeteasy inquiry from')) {
    return 'streeteasy';
  }

  const isZillowFrom = from.includes('rentalclientservices@zillowrentals.com');
  const isZillowSubject = subject.includes('new zillow group rentals contact:');
  const hasTourKeyword = bodyLower.includes('tour') || bodyLower.includes('schedule a tour');

  if (isZillowFrom && isZillowSubject && hasTourKeyword) return 'zillow';

  const isForwarded = subject.includes('fwd:') || subject.includes('fw:');
  const bodyHasZillow =
    bodyLower.includes('rentalclientservices@zillowrentals.com') ||
    bodyLower.includes('zillow group rentals');

  if (isForwarded && bodyHasZillow && hasTourKeyword) return 'zillow';

  return null;
}

function parseStreetEasyEmail(
  headers: { name: string; value: string }[],
  body: string
): ParsedTourEmail | null {
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? '';
  const subjectMatch = subject.match(/^(.+?)\s+StreetEasy\s+Inquiry\s+From\s+(.+)$/i);

  let clientName = '';
  let propertyAddress = '';

  if (subjectMatch) {
    propertyAddress = subjectMatch[1].trim();
    clientName = subjectMatch[2].trim();
  } else {
    const bodyNameAddr = body.match(/(.+?)\s+Has Requested a Tour for\s+(.+)/i);
    if (bodyNameAddr) {
      clientName = bodyNameAddr[1].trim();
      propertyAddress = bodyNameAddr[2].trim();
    }
  }

  if (!clientName) return null;

  const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = body.match(/(\+?\d{10,})/);

  return {
    clientName,
    clientEmail: emailMatch?.[1] ?? '',
    clientPhone: phoneMatch?.[1],
    propertyAddress,
    source: 'streeteasy',
  };
}

function extractZillowAddressFromSubject(subject: string): string | null {
  const match = subject.match(/New Zillow Group Rentals Contact:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

function parseZillowEmail(body: string): ParsedTourEmail | null {
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

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
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
    throw new AuthError(`Token refresh failed: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Search Gmail for messages matching a query string.
 * Uses pagination to fetch up to maxResults messages.
 */
async function searchMessages(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  while (messageIds.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, maxResults - messageIds.length)),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) throw new AuthError('Access token expired');
    if (!response.ok) {
      throw new Error(`Gmail search error (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();
    if (!data.messages || data.messages.length === 0) break;

    for (const msg of data.messages) {
      messageIds.push(msg.id);
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return messageIds;
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

// --- Backfill handler ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { agentId, maxResults = 500 } = await req.json();
    if (!agentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'agentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Look up agent connection
    const connResponse = await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?agent_id=eq.${agentId}&select=*`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const connections = await connResponse.json();
    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Gmail connection found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connection = connections[0];

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
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Token refresh failed, re-auth needed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Search for StreetEasy and Zillow emails
    const queries = [
      'from:noreply@email.streeteasy.com subject:"streeteasy inquiry from"',
      'from:rentalclientservices@zillowrentals.com subject:"new zillow group rentals contact"',
    ];

    const allMessageIds = new Set<string>();
    for (const q of queries) {
      const ids = await searchMessages(accessToken, q, maxResults);
      for (const id of ids) allMessageIds.add(id);
    }

    const allMessageIdsList = Array.from(allMessageIds);
    console.log(`[Gmail Backfill] Found ${allMessageIdsList.length} candidate messages for agent ${agentId}`);

    // Process messages in concurrent batches of 10, insert after each batch
    const FETCH_CONCURRENCY = 10;
    let inserted = 0;
    let tourRequestsFound = 0;

    for (let i = 0; i < allMessageIdsList.length; i += FETCH_CONCURRENCY) {
      const chunk = allMessageIdsList.slice(i, i + FETCH_CONCURRENCY);

      // Fetch messages concurrently
      const messages = await Promise.allSettled(
        chunk.map((msgId) => fetchMessage(accessToken, msgId))
      );

      const batchRecords: any[] = [];

      for (let j = 0; j < messages.length; j++) {
        const result = messages[j];
        if (result.status !== 'fulfilled') {
          console.error(`[Gmail Backfill] Error fetching message ${chunk[j]}:`, result.reason);
          continue;
        }

        const message = result.value;
        const msgId = chunk[j];

        try {
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
            if (source === 'zillow' && !parsed.propertyAddress) {
              parsed.propertyAddress = extractZillowAddressFromSubject(subject) || subject;
            }
            batchRecords.push({
              agent_id: connection.agent_id,
              gmail_message_id: msgId,
              client_name: parsed.clientName,
              client_email: parsed.clientEmail,
              client_phone: parsed.clientPhone || null,
              property_address: parsed.propertyAddress,
              raw_subject: subject,
              received_at: receivedAt,
              source: parsed.source,
            });
          } else {
            const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value ?? '';
            const fallbackAddress =
              source === 'zillow'
                ? extractZillowAddressFromSubject(subject) || subject
                : subject;
            batchRecords.push({
              agent_id: connection.agent_id,
              gmail_message_id: msgId,
              client_name: `${source === 'zillow' ? 'Zillow' : 'StreetEasy'} Lead`,
              client_email: fromHeader,
              client_phone: null,
              property_address: fallbackAddress,
              raw_subject: subject,
              received_at: receivedAt,
              source,
            });
          }
        } catch (parseErr) {
          console.error(`[Gmail Backfill] Error parsing message ${msgId}:`, parseErr);
        }
      }

      // Insert this batch immediately
      if (batchRecords.length > 0) {
        tourRequestsFound += batchRecords.length;
        const res = await fetch(`${supabaseUrl}/rest/v1/tour_requests`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=ignore-duplicates',
          },
          body: JSON.stringify(batchRecords),
        });

        if (res.ok) {
          inserted += batchRecords.length;
        } else {
          console.error(`[Gmail Backfill] Insert error:`, await res.text());
        }
      }
    }

    console.log(`[Gmail Backfill] Backfilled ${inserted} tour requests for agent ${agentId}`);

    return new Response(
      JSON.stringify({
        success: true,
        messagesSearched: allMessageIdsList.length,
        tourRequestsFound,
        inserted,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Gmail Backfill] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
