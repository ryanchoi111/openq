/**
 * Gmail Webhook Edge Function
 *
 * Receives Google Cloud Pub/Sub push notifications when new emails arrive
 * in a monitored Gmail account. Detects tour request emails from Zillow
 * and StreetEasy, parses client info, and stores them.
 *
 * CRITICAL: Must respond within 1 second. Processing happens async.
 */

import {
  AuthError,
  getAccessToken,
  fetchNewMessagesSince,
  fetchMessage,
  parseMessageToTourRecord,
  upsertTourRequests,
  updateHistoryId,
  markNeedsReauth,
  supabaseHeaders,
  type TourRecord,
} from '../_shared/gmailSync.ts';

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
      { headers: supabaseHeaders(supabaseServiceKey) },
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
        console.error(`Agent ${emailAddress} needs re-auth:`, err.message);
      }
      return new Response('OK', { status: 200 });
    }

    // Fetch new messages via history API
    let messageIds: string[];
    try {
      const result = await fetchNewMessagesSince(accessToken, lastHistoryId);
      messageIds = result.messageIds;
      // If stale, just skip — webhook will catch up on next push
    } catch (err) {
      if (err instanceof AuthError) {
        await markNeedsReauth(connection.id, supabaseUrl, supabaseServiceKey);
        return new Response('OK', { status: 200 });
      }
      throw err;
    }

    console.log(`[Gmail Webhook] Found ${messageIds.length} new messages for ${emailAddress}`);

    // Fetch and parse messages
    const records: TourRecord[] = [];

    for (const msgId of messageIds) {
      try {
        const message = await fetchMessage(accessToken, msgId);
        const record = parseMessageToTourRecord(message, msgId, connection.agent_id, emailAddress);
        if (record) {
          records.push(record);
          console.log(`[Gmail Webhook] ${record.source} email parsed:`, {
            client: record.client_name,
            property: record.property_address,
          });
        }
      } catch (parseErr) {
        console.error(`[Gmail Webhook] Error processing message ${msgId}:`, parseErr);
      }
    }

    // Update historyId
    await updateHistoryId(connection.id, historyId, supabaseUrl, supabaseServiceKey);

    // Store parsed tour requests
    if (records.length > 0) {
      const { error: insertErr } = await upsertTourRequests(records, supabaseUrl, supabaseServiceKey);
      if (insertErr) {
        console.error('Error inserting tour requests:', insertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messagesProcessed: messageIds.length,
        tourEmailsFound: records.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Gmail Webhook] Unhandled error:', error);
    return new Response('OK', { status: 200 });
  }
});
