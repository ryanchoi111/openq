/**
 * Gmail Monitoring Service
 *
 * Client-side service for managing Gmail OAuth connections
 * and interacting with Gmail monitoring edge functions.
 */

import { supabase, supabaseUrl } from '../config/supabase';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { TourRequest, AgentGmailConnection, PropertyLabel } from '../types/gmail';

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

const IOS_REVERSED_CLIENT_ID = GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.');

WebBrowser.maybeCompleteAuthSession();

function getOAuthConfig() {
  if (Platform.OS === 'ios') {
    return {
      clientId: GOOGLE_IOS_CLIENT_ID,
      redirectUri: `${IOS_REVERSED_CLIENT_ID}:/oauth2redirect`,
    };
  }
  // Android: use web client ID with package-based redirect
  // Android native client IDs only work with Google Sign-In SDK, not browser OAuth
  const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  return {
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri: `com.openqapp.openq:/oauth2redirect`,
  };
}

/**
 * Initiate Gmail OAuth flow to connect an agent's Gmail account.
 * After auth, stores the refresh token and sets up Gmail watch.
 */
export async function connectGmailAccount(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const discovery = {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };

    const { clientId, redirectUri } = getOAuthConfig();
    console.log('[Gmail OAuth] Platform:', Platform.OS);
    console.log('[Gmail OAuth] Client ID:', clientId);
    console.log('[Gmail OAuth] Redirect URI:', redirectUri);

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: GMAIL_SCOPES,
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    });

    const result = await request.promptAsync(discovery);

    if (result.type !== 'success' || !result.params.code) {
      return { success: false, error: 'OAuth flow cancelled or failed' };
    }

    // Exchange code for tokens — native clients with PKCE don't need client_secret
    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code,
        redirectUri,
        extraParams: {
          code_verifier: request.codeVerifier ?? '',
        },
      },
      discovery
    );

    if (!tokenResult.refreshToken) {
      return { success: false, error: 'No refresh token received. Try removing app access in Google settings and retry.' };
    }

    // Get the Gmail address for this token
    const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
    });

    if (!profileResponse.ok) {
      return { success: false, error: 'Failed to fetch Gmail profile' };
    }

    const profile = await profileResponse.json();
    const email = profile.emailAddress;

    // Store connection in Supabase (include oauth_client_id so edge function uses correct client)
    const { error: upsertError } = await supabase
      .from('agent_gmail_connections')
      .upsert(
        {
          agent_id: agentId,
          email,
          refresh_token: tokenResult.refreshToken,
          oauth_client_id: clientId,
          needs_reauth: false,
        },
        { onConflict: 'agent_id' }
      );

    if (upsertError) {
      console.error('Error storing Gmail connection:', upsertError);
      return { success: false, error: 'Failed to save Gmail connection' };
    }

    // Set up Gmail watch via edge function
    const watchResult = await setupGmailWatch(agentId);
    if (!watchResult.success) {
      return { success: false, error: watchResult.error || 'Failed to set up email monitoring' };
    }

    // Backfill historical tour request emails
    backfillTourRequests(agentId).catch((err) =>
      console.error('Background backfill failed:', err)
    );

    return { success: true };
  } catch (error) {
    console.error('Gmail OAuth error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during Gmail connection',
    };
  }
}

/**
 * Call the gmail-watch edge function to set up/renew push notifications.
 */
export async function setupGmailWatch(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-watch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agentId }),
    });

    const data = await response.json();
    return { success: data.success, error: data.error };
  } catch (error) {
    console.error('Gmail watch setup error:', error);
    return { success: false, error: 'Failed to set up Gmail watch' };
  }
}

/**
 * Get the agent's Gmail connection status.
 */
export async function getGmailConnectionStatus(agentId: string): Promise<AgentGmailConnection | null> {
  const { data, error } = await supabase
    .from('agent_gmail_connections')
    .select('agent_id, email, history_id, watch_expiration, needs_reauth')
    .eq('agent_id', agentId)
    .single();

  if (error || !data) return null;

  return {
    agentId: data.agent_id,
    email: data.email,
    historyId: data.history_id,
    watchExpiration: data.watch_expiration,
    needsReauth: data.needs_reauth,
  };
}

/**
 * Disconnect Gmail monitoring for an agent.
 */
export async function disconnectGmailAccount(agentId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agent_gmail_connections')
    .delete()
    .eq('agent_id', agentId);

  if (error) {
    return { success: false, error: 'Failed to disconnect Gmail' };
  }
  return { success: true };
}

/**
 * Fetch tour requests for an agent. Each row is decorated with the
 * per-property label looked up from tour_request_properties.
 */
export async function getTourRequests(agentId: string): Promise<TourRequest[]> {
  const [requestsRes, propsRes] = await Promise.all([
    supabase
      .from('tour_requests')
      .select('*')
      .eq('agent_id', agentId)
      .order('received_at', { ascending: false }),
    supabase
      .from('tour_request_properties')
      .select('address,label')
      .eq('agent_id', agentId),
  ]);

  if (requestsRes.error) {
    console.error('Error fetching tour requests:', requestsRes.error);
    return [];
  }
  if (propsRes.error) {
    console.error('Error fetching tour_request_properties:', propsRes.error);
  }

  const labelByAddress = new Map<string, PropertyLabel>();
  for (const p of propsRes.data ?? []) {
    labelByAddress.set(p.address, (p.label ?? 'none') as PropertyLabel);
  }

  return (requestsRes.data || []).map((row: any) => ({
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    propertyAddress: row.property_address,
    rawSubject: row.raw_subject,
    receivedAt: row.received_at,
    gmailMessageId: row.gmail_message_id,
    agentEmail: row.agent_email || '',
    source: row.source,
    label: labelByAddress.get(row.property_address) ?? 'none',
  }));
}

/**
 * Set a property's label. Upserts a row in tour_request_properties so the
 * label persists even if no tour_requests row exists yet for the address.
 */
export async function setPropertyLabel(
  agentId: string,
  propertyAddress: string,
  label: PropertyLabel,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('tour_request_properties')
    .upsert(
      { agent_id: agentId, address: propertyAddress, label },
      { onConflict: 'agent_id,address' },
    );
  return { error: error?.message ?? null };
}

/**
 * Backfill historical tour request emails from before the watch was set up.
 * Searches Gmail for StreetEasy and Zillow emails and inserts them.
 */
export async function backfillTourRequests(
  agentId: string,
  maxResults = 200
): Promise<{ success: boolean; tourRequestsFound?: number; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-backfill`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agentId, maxResults }),
    });

    const data = await response.json();
    return {
      success: data.success,
      tourRequestsFound: data.tourRequestsFound,
      error: data.error,
    };
  } catch (error) {
    console.error('Gmail backfill error:', error);
    return { success: false, error: 'Failed to backfill tour requests' };
  }
}

/**
 * Fast incremental sync — fetches only new emails since last sync using Gmail historyId.
 * Use for the "Refresh" button and auto-sync on screen focus.
 * Falls back to backfill if no historyId exists yet.
 */
export async function incrementalSyncTourRequests(
  agentId: string,
  force = false
): Promise<{ success: boolean; newCount?: number; needsFullSync?: boolean; skipped?: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/gmail-incremental-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agentId, force }),
    });

    const data = await response.json();

    // If server says historyId is missing, fall back to full backfill
    if (data.needsFullSync) {
      return backfillTourRequests(agentId);
    }

    return {
      success: data.success,
      newCount: data.newCount,
      needsFullSync: false,
      skipped: data.skipped,
      error: data.error,
    };
  } catch (error) {
    console.error('Incremental sync error:', error);
    return { success: false, error: 'Failed to sync tour requests' };
  }
}

/**
 * Check if agent's Gmail watch needs renewal (expires within 1 day).
 * Call this on app launch or periodically.
 */
export async function renewWatchIfNeeded(agentId: string): Promise<void> {
  const connection = await getGmailConnectionStatus(agentId);
  if (!connection || connection.needsReauth) return;

  if (!connection.watchExpiration) {
    await setupGmailWatch(agentId);
    return;
  }

  const expiration = new Date(connection.watchExpiration).getTime();
  const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000;

  if (expiration < oneDayFromNow) {
    console.log('[Gmail] Renewing watch — expiring soon');
    await setupGmailWatch(agentId);
  }
}
