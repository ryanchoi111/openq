/**
 * Gmail Watch Edge Function
 *
 * Sets up or renews a Gmail push notification watch for an agent.
 * Called by the app after OAuth, and periodically to renew (every 6 days).
 *
 * Expects: { agentId: string }
 * Uses the agent's stored refresh token to set up the watch.
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const GOOGLE_PROJECT_ID = Deno.env.get('GOOGLE_PROJECT_ID') ?? '';

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

    // Validate auth — ensure caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { agentId } = await req.json();
    if (!agentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'agentId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Look up agent's Gmail connection
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
        JSON.stringify({ success: false, error: 'No Gmail connection found for this agent' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const connection = connections[0];

    // Get fresh access token using the same client ID that obtained the refresh token
    const oauthClientId = connection.oauth_client_id || GOOGLE_CLIENT_ID;
    const isNativeClient = oauthClientId !== GOOGLE_CLIENT_ID;

    const tokenParams: Record<string, string> = {
      client_id: oauthClientId,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    };
    // Native (iOS/Android) clients don't use client_secret; web clients do
    if (!isNativeClient) {
      tokenParams.client_secret = GOOGLE_CLIENT_SECRET;
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
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
      return new Response(
        JSON.stringify({ success: false, error: 'Token refresh failed, re-auth needed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;

    // Set up Gmail watch
    const topicName = `projects/${GOOGLE_PROJECT_ID}/topics/gmail-push`;
    const watchResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName,
          labelIds: ['INBOX'],
        }),
      }
    );

    if (!watchResponse.ok) {
      const err = await watchResponse.text();
      throw new Error(`Gmail watch setup failed (${watchResponse.status}): ${err}`);
    }

    const watchData = await watchResponse.json();

    // Update connection with watch expiration and historyId
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
        body: JSON.stringify({
          history_id: watchData.historyId,
          watch_expiration: new Date(parseInt(watchData.expiration)).toISOString(),
          needs_reauth: false,
        }),
      }
    );

    console.log(`[Gmail Watch] Watch set for agent ${agentId}, expires: ${watchData.expiration}`);

    return new Response(
      JSON.stringify({
        success: true,
        historyId: watchData.historyId,
        expiration: watchData.expiration,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Gmail Watch] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
