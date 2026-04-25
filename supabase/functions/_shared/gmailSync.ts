/**
 * Shared Gmail sync helpers used by gmail-webhook, gmail-backfill, and gmail-incremental-sync.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

// --- Types ---

export type EmailSource = 'zillow' | 'streeteasy';

export interface ParsedTourEmail {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  propertyAddress: string;
  source: EmailSource;
}

export interface TourRecord {
  agent_id: string;
  gmail_message_id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  property_address: string;
  raw_subject: string;
  received_at: string;
  source: EmailSource;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// --- Supabase Helpers ---

export function supabaseHeaders(serviceKey: string): Record<string, string> {
  return {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
}

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

/**
 * Verify the JWT and assert the caller is the agent they claim to be.
 * Returns null on success, or a Response to return immediately on failure.
 */
export async function verifyAgent(
  authHeader: string,
  agentId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<Response | null> {
  const token = authHeader.replace('Bearer ', '');
  const client = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error } = await client.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ success: false, error: 'Invalid token' }, 401);
  }
  if (user.id !== agentId) {
    return jsonResponse({ success: false, error: 'Forbidden' }, 403);
  }
  return null;
}

// --- Token Management ---

/**
 * Get a valid access token, using cached token if still valid.
 * Caches refreshed token in DB when connectionId and supabase params are provided.
 */
export async function getAccessToken(
  refreshToken: string,
  oauthClientId?: string,
  cached?: { accessToken?: string | null; expiresAt?: string | null },
  connectionId?: string,
  supabaseUrl?: string,
  supabaseServiceKey?: string,
): Promise<string> {
  if (cached?.accessToken && cached?.expiresAt) {
    const expiresAt = new Date(cached.expiresAt).getTime();
    if (expiresAt - 60_000 > Date.now()) {
      return cached.accessToken;
    }
  }

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

  const data = await response.json();
  const accessToken: string = data.access_token;
  const expiresIn: number = data.expires_in || 3600;

  if (connectionId && supabaseUrl && supabaseServiceKey) {
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connectionId}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders(supabaseServiceKey),
        body: JSON.stringify({
          access_token: accessToken,
          access_token_expires_at: expiresAt,
        }),
      }
    );
  }

  return accessToken;
}

// --- Email Source Detection ---

export function detectEmailSource(
  headers: { name: string; value: string }[],
  body: string
): EmailSource | null {
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value?.toLowerCase() ?? '';
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value?.toLowerCase() ?? '';
  const bodyLower = body.toLowerCase();

  // StreetEasy
  if (from.includes('noreply@email.streeteasy.com') && subject.includes('streeteasy inquiry from')) {
    return 'streeteasy';
  }

  // Zillow direct
  const isZillowFrom = from.includes('rentalclientservices@zillowrentals.com');
  const isZillowSubject = subject.includes('new zillow group rentals contact:');
  const hasTourKeyword = bodyLower.includes('tour') || bodyLower.includes('schedule a tour');

  if (isZillowFrom && isZillowSubject && hasTourKeyword) return 'zillow';

  // Forwarded Zillow — disabled for now
  // const isForwarded = subject.includes('fwd:') || subject.includes('fw:');
  // const bodyHasZillow =
  //   bodyLower.includes('rentalclientservices@zillowrentals.com') ||
  //   bodyLower.includes('zillow group rentals');
  // if (isForwarded && bodyHasZillow && hasTourKeyword) return 'zillow';

  return null;
}

// --- Email Parsers ---

export function parseStreetEasyEmail(
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

export function extractZillowAddressFromSubject(subject: string): string | null {
  const match = subject.match(/New Zillow Group Rentals Contact:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

export function parseZillowEmail(body: string): ParsedTourEmail | null {
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

// --- MIME Body Extraction ---

export function getEmailBody(payload: any): string {
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

// --- Gmail API Helpers ---

export async function fetchMessage(accessToken: string, messageId: string): Promise<any> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new AuthError('Access token expired');
  if (!response.ok) throw new Error(`Gmail message fetch error (${response.status})`);

  return response.json();
}

/**
 * Fetch new message IDs since a given historyId using Gmail history API.
 * Returns { messageIds, latestHistoryId, stale } where stale=true means historyId expired.
 */
export async function fetchNewMessagesSince(
  accessToken: string,
  historyId: string
): Promise<{ messageIds: string[]; latestHistoryId: string; stale: boolean }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = historyId;

  while (true) {
    const params = new URLSearchParams({
      startHistoryId: historyId,
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404 || response.status === 410) {
      return { messageIds: [], latestHistoryId: historyId, stale: true };
    }
    if (response.status === 401) throw new AuthError('Access token expired');
    if (response.status === 429) throw new Error('Gmail API rate limited');
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 400 && text.includes('Invalid startHistoryId')) {
        return { messageIds: [], latestHistoryId: historyId, stale: true };
      }
      throw new Error(`Gmail history API error (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (data.historyId) latestHistoryId = data.historyId;
    if (!data.history) break;

    for (const entry of data.history) {
      if (entry.messagesAdded) {
        for (const msg of entry.messagesAdded) {
          messageIds.add(msg.message.id);
        }
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return { messageIds: Array.from(messageIds), latestHistoryId, stale: false };
}

/**
 * Search Gmail for messages matching a query.
 * Used by backfill and stale-history fallback.
 */
export async function searchMessages(
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

/**
 * Parse a fetched Gmail message into a TourRecord, or null if not a tour email.
 */
export function parseMessageToTourRecord(
  message: any,
  messageId: string,
  agentId: string,
  agentEmail: string,
): TourRecord | null {
  const headers = message.payload?.headers || [];
  const body = getEmailBody(message.payload);
  const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value ?? '';
  const receivedAt = new Date(parseInt(message.internalDate)).toISOString();

  const source = detectEmailSource(headers, body);
  if (!source) return null;

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
    return {
      agent_id: agentId,
      gmail_message_id: messageId,
      client_name: parsed.clientName,
      client_email: parsed.clientEmail,
      client_phone: parsed.clientPhone || null,
      property_address: parsed.propertyAddress,
      raw_subject: subject,
      received_at: receivedAt,
      source: parsed.source,
    };
  }

  // Fallback: store with whatever we can extract
  const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value ?? '';
  const fallbackAddress =
    source === 'zillow'
      ? extractZillowAddressFromSubject(subject) || subject
      : subject;

  return {
    agent_id: agentId,
    gmail_message_id: messageId,
    client_name: `${source === 'zillow' ? 'Zillow' : 'StreetEasy'} Lead`,
    client_email: fromHeader,
    client_phone: null,
    property_address: fallbackAddress,
    raw_subject: subject,
    received_at: receivedAt,
    source,
  };
}

/**
 * Upsert tour request records into Supabase, ignoring duplicates.
 * Also upserts the distinct (agent_id, address) pairs into tour_request_properties
 * so each property has a row to hang a label on. Existing rows are preserved
 * (ignore-duplicates) so labels are never overwritten.
 */
export async function upsertTourRequests(
  records: TourRecord[],
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{ error: string | null }> {
  if (records.length === 0) return { error: null };

  // 1) Upsert per-property rows first (preserves existing labels via ignore-duplicates).
  const seen = new Set<string>();
  const propertyRows: { agent_id: string; address: string }[] = [];
  for (const r of records) {
    if (!r.property_address) continue;
    const key = `${r.agent_id}|${r.property_address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    propertyRows.push({ agent_id: r.agent_id, address: r.property_address });
  }

  if (propertyRows.length > 0) {
    const propRes = await fetch(`${supabaseUrl}/rest/v1/tour_request_properties`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(propertyRows),
    });
    if (!propRes.ok) {
      const text = await propRes.text();
      return { error: `tour_request_properties upsert failed: ${text}` };
    }
  }

  // 2) Insert tour_requests rows (ignore duplicates by gmail_message_id).
  const res = await fetch(`${supabaseUrl}/rest/v1/tour_requests`, {
    method: 'POST',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(records),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: text };
  }
  return { error: null };
}

/**
 * Mark an agent connection as needing re-auth.
 */
export async function markNeedsReauth(
  connectionId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connectionId}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(supabaseServiceKey),
      body: JSON.stringify({ needs_reauth: true }),
    }
  );
}

/**
 * Update history_id. Concurrent calls are safe due to gmail_message_id dedup on tour_requests.
 */
export async function updateHistoryId(
  connectionId: string,
  newHistoryId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connectionId}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(supabaseServiceKey),
      body: JSON.stringify({ history_id: newHistoryId }),
    }
  );
}

/** Tour request search queries for StreetEasy and Zillow. */
export const TOUR_REQUEST_QUERIES = [
  'from:noreply@email.streeteasy.com subject:"streeteasy inquiry from"',
  'from:rentalclientservices@zillowrentals.com subject:"new zillow group rentals contact"',
];

/**
 * Get the current Gmail profile historyId (useful for resetting after stale fallback).
 */
export async function getCurrentHistoryId(accessToken: string): Promise<string> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new AuthError('Access token expired');
  if (!response.ok) throw new Error(`Gmail profile fetch error (${response.status})`);

  const data = await response.json();
  return String(data.historyId);
}
