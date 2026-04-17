/**
 * Gmail Backfill Edge Function
 *
 * Searches historical Gmail messages for tour request emails (Zillow, StreetEasy)
 * that arrived before the Pub/Sub watch was set up. Uses Gmail search API
 * instead of history-based incremental fetch.
 *
 * Expects: { agentId: string, maxResults?: number }
 */

import {
  AuthError,
  getAccessToken,
  searchMessages,
  fetchMessage,
  parseMessageToTourRecord,
  upsertTourRequests,
  markNeedsReauth,
  TOUR_REQUEST_QUERIES,
  CORS_HEADERS,
  supabaseHeaders,
  verifyAgent,
  jsonResponse,
  type TourRecord,
} from '../_shared/gmailSync.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Missing Authorization header' }, 401);
    }

    const { agentId, maxResults = 200 } = await req.json();
    if (!agentId) {
      return jsonResponse({ success: false, error: 'agentId is required' }, 400);
    }

    // Verify caller is the agent they claim to be
    const authError = await verifyAgent(authHeader, agentId, supabaseUrl, supabaseServiceKey);
    if (authError) return authError;

    // Look up agent connection
    const connResponse = await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?agent_id=eq.${agentId}&select=*`,
      { headers: supabaseHeaders(supabaseServiceKey) },
    );

    const connections = await connResponse.json();
    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Gmail connection found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connection = connections[0];

    // Get access token (with caching)
    let accessToken: string;
    try {
      accessToken = await getAccessToken(
        connection.refresh_token,
        connection.oauth_client_id,
        { accessToken: connection.access_token, expiresAt: connection.access_token_expires_at },
        connection.id,
        supabaseUrl,
        supabaseServiceKey,
      );
    } catch (err) {
      if (err instanceof AuthError) {
        await markNeedsReauth(connection.id, supabaseUrl, supabaseServiceKey);
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Token refresh failed, re-auth needed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Search for StreetEasy and Zillow emails
    const allMessageIds = new Set<string>();
    for (const q of TOUR_REQUEST_QUERIES) {
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

      const messages = await Promise.allSettled(
        chunk.map((msgId) => fetchMessage(accessToken, msgId))
      );

      const batchRecords: TourRecord[] = [];

      for (let j = 0; j < messages.length; j++) {
        const result = messages[j];
        if (result.status !== 'fulfilled') {
          console.error(`[Gmail Backfill] Error fetching message ${chunk[j]}:`, result.reason);
          continue;
        }

        try {
          const record = parseMessageToTourRecord(
            result.value,
            chunk[j],
            connection.agent_id,
            connection.email,
          );
          if (record) batchRecords.push(record);
        } catch (parseErr) {
          console.error(`[Gmail Backfill] Error parsing message ${chunk[j]}:`, parseErr);
        }
      }

      // Insert this batch immediately
      if (batchRecords.length > 0) {
        tourRequestsFound += batchRecords.length;
        const { error: upsertErr } = await upsertTourRequests(batchRecords, supabaseUrl, supabaseServiceKey);
        if (upsertErr) {
          console.error(`[Gmail Backfill] Insert error:`, upsertErr);
        } else {
          inserted += batchRecords.length;
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
