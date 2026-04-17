/**
 * Gmail Incremental Sync Edge Function
 *
 * User-triggered fast refresh that fetches only new emails since last sync
 * using Gmail's history API. Falls back to a bounded search if historyId is stale.
 *
 * Expects: { agentId: string, force?: boolean }
 * - force: bypass 30s debounce (for explicit "Refresh" taps)
 */

import {
  AuthError,
  getAccessToken,
  fetchNewMessagesSince,
  fetchMessage,
  parseMessageToTourRecord,
  upsertTourRequests,
  markNeedsReauth,
  searchMessages,
  getCurrentHistoryId,
  TOUR_REQUEST_QUERIES,
  jsonResponse,
  CORS_HEADERS,
  supabaseHeaders,
  verifyAgent,
  type TourRecord,
} from '../_shared/gmailSync.ts';

const DEBOUNCE_SECONDS = 30;
const STALE_FALLBACK_MAX_RESULTS = 50;

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

    const { agentId, force = false } = await req.json();
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
      return jsonResponse({ success: false, error: 'No Gmail connection found' }, 404);
    }

    const connection = connections[0];

    // No history_id means backfill never ran — tell client to run full backfill
    if (!connection.history_id) {
      return jsonResponse({ success: true, newCount: 0, needsFullSync: true });
    }

    // Debounce: skip if last sync was < 30s ago (unless force=true)
    if (!force && connection.last_synced_at) {
      const elapsed = Date.now() - new Date(connection.last_synced_at).getTime();
      if (elapsed < DEBOUNCE_SECONDS * 1000) {
        return jsonResponse({ success: true, newCount: 0, skipped: true });
      }
    }

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
      return jsonResponse({ success: false, error: 'Token refresh failed, re-auth needed' }, 401);
    }

    // Fetch new messages via history API
    let result;
    try {
      result = await fetchNewMessagesSince(accessToken, connection.history_id);
    } catch (err) {
      if (err instanceof AuthError) {
        await markNeedsReauth(connection.id, supabaseUrl, supabaseServiceKey);
        return jsonResponse({ success: false, error: 'Access token expired' }, 401);
      }
      throw err;
    }

    let { messageIds, latestHistoryId, stale } = result;

    // Stale history fallback: bounded search using last received_at
    if (stale) {
      console.log(`[Incremental Sync] Stale historyId for agent ${agentId}, falling back to bounded search`);
      messageIds = await staleFallbackSearch(accessToken, agentId, supabaseUrl, supabaseServiceKey);
      // Reset historyId to current
      latestHistoryId = await getCurrentHistoryId(accessToken);
    }

    console.log(`[Incremental Sync] ${messageIds.length} new messages for agent ${agentId}`);

    // Fetch and parse messages in parallel
    const records: TourRecord[] = [];

    if (messageIds.length > 0) {
      const messages = await Promise.allSettled(
        messageIds.map((id) => fetchMessage(accessToken, id))
      );

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.status !== 'fulfilled') {
          console.error(`[Incremental Sync] Error fetching ${messageIds[i]}:`, msg.reason);
          continue;
        }
        const record = parseMessageToTourRecord(
          msg.value,
          messageIds[i],
          connection.agent_id,
          connection.email,
        );
        if (record) records.push(record);
      }

      // Upsert parsed records
      const { error: upsertErr } = await upsertTourRequests(records, supabaseUrl, supabaseServiceKey);
      if (upsertErr) {
        console.error('[Incremental Sync] Upsert error:', upsertErr);
      }
    }

    // Update history_id and last_synced_at
    await fetch(
      `${supabaseUrl}/rest/v1/agent_gmail_connections?id=eq.${connection.id}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders(supabaseServiceKey),
        body: JSON.stringify({
          history_id: latestHistoryId,
          last_synced_at: new Date().toISOString(),
        }),
      }
    );

    return jsonResponse({
      success: true,
      newCount: records.length,
      needsFullSync: false,
    });
  } catch (error) {
    console.error('[Incremental Sync] Error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Fallback when historyId is stale (>7 days).
 * Runs a bounded search using `after:` based on most recent tour_request received_at.
 */
async function staleFallbackSearch(
  accessToken: string,
  agentId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<string[]> {
  // Find most recent tour request date for this agent
  const res = await fetch(
    `${supabaseUrl}/rest/v1/tour_requests?agent_id=eq.${agentId}&select=received_at&order=received_at.desc&limit=1`,
    { headers: supabaseHeaders(supabaseServiceKey) },
  );

  let afterDate: string;
  const rows = await res.json();
  if (rows && rows.length > 0) {
    // 1 day before the most recent tour request
    const d = new Date(rows[0].received_at);
    d.setDate(d.getDate() - 1);
    afterDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } else {
    // No tour requests at all — search last 30 days
    const d = new Date();
    d.setDate(d.getDate() - 30);
    afterDate = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  const allIds = new Set<string>();
  for (const q of TOUR_REQUEST_QUERIES) {
    const ids = await searchMessages(accessToken, `${q} after:${afterDate}`, STALE_FALLBACK_MAX_RESULTS);
    for (const id of ids) allIds.add(id);
  }

  return Array.from(allIds);
}
