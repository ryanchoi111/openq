/**
 * Authentication Context
 * Pure Supabase Auth with Google OAuth support
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../config/supabase';
import { setupGmailWatch } from '../services/gmailService';
import { User, GuestUser, UserRole } from '../types';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | GuestUser | null;
  session: Session | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string, role: UserRole) => Promise<void>;
  signInWithGoogle: (role?: UserRole) => Promise<void>;
  signInAsGuest: (name: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const GUEST_USER_KEY = 'openhouse_guest_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | GuestUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    loadSession();
  }, []);

  // Listen to Supabase auth state changes
  // OAuth flow handles profile loading directly, so skip on SIGNED_IN
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user && event !== 'SIGNED_IN') {
        await loadUserProfile(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        await loadGuestUser();
      }
    } catch (error) {
      console.error('[Auth] Error loading session:', error);
      await loadGuestUser();
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (supabaseUser: SupabaseUser, retries = 3) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) {
        if (retries > 0 && (error.code === 'PGRST116' || error.code === 'PGRST301')) {
          await new Promise(r => setTimeout(r, 500));
          return loadUserProfile(supabaseUser, retries - 1);
        }
        throw error;
      }

      setUser(data as User);
      await SecureStore.deleteItemAsync(GUEST_USER_KEY);
    } catch (error) {
      console.error('[Auth] Error loading user profile:', error);
      throw error;
    }
  };

  const loadGuestUser = async () => {
    try {
      const guestData = await SecureStore.getItemAsync(GUEST_USER_KEY);
      if (guestData) {
        setUser(JSON.parse(guestData) as GuestUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('[Auth] Error loading guest user:', error);
      setUser(null);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await loadUserProfile(data.user);
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string, role: UserRole) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role } },
    });
    if (error) throw error;
  };

  const signInWithGoogle = async (role?: UserRole) => {
    try {
      // Store role for post-OAuth update (trigger defaults to 'tenant')
      // NOTE: Users can self-select roles. RLS policies prevent unauthorized data access.
      // TODO (Option B): Implement agent verification system
      //   - Add 'agent_verified' boolean field to users table
      //   - Set agent_verified = false for new agents
      //   - Require license upload/verification before granting full agent access
      //   - Add verification workflow in agent dashboard
      if (role) {
        await SecureStore.setItemAsync('openhouse_oauth_role', role);
      }

      const redirectUri = AuthSession.makeRedirectUri();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri },
      });

      if (error || !data?.url) {
        throw error || new Error('No OAuth URL generated');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

      if (result.type !== 'success') {
        throw new Error(result.type === 'cancel' ? 'OAuth cancelled' : 'OAuth failed');
      }

      // Extract tokens from redirect URL (may be in query params or hash)
      const url = new URL(result.url);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const access_token = url.searchParams.get('access_token') || hashParams.get('access_token');
      const refresh_token = url.searchParams.get('refresh_token') || hashParams.get('refresh_token');
      const provider_refresh_token = url.searchParams.get('provider_refresh_token') || hashParams.get('provider_refresh_token');

      if (!access_token || !refresh_token) {
        throw new Error('No tokens found in OAuth response');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (sessionError) throw sessionError;

      // Wait for session propagation before querying
      await new Promise(r => setTimeout(r, 500));

      if (sessionData.user) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', sessionData.user.id)
          .single();

        if (userError) throw userError;

        if (userData) {
          // Update role if user selected different role than trigger default
          // TODO (Option B): When implementing agent verification:
          //   - If storedRole === 'agent', set role to 'agent' but agent_verified = false
          //   - Show "Verification Required" banner in agent dashboard
          //   - Restrict certain agent features until verified
          //   - After verification, set agent_verified = true
          const storedRole = await SecureStore.getItemAsync('openhouse_oauth_role') as UserRole | null;
          if (storedRole && userData.role !== storedRole) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ role: storedRole })
              .eq('id', userData.id);

            if (!updateError) {
              userData.role = storedRole;
            }
          }

          await SecureStore.deleteItemAsync('openhouse_oauth_role');
          setUser(userData as User);
          await SecureStore.deleteItemAsync(GUEST_USER_KEY);

          // Auto-connect Gmail for agents if Google refresh token available
          const effectiveRole = userData.role;
          if (effectiveRole === 'agent' && provider_refresh_token && userData.email) {
            try {
              await supabase.from('agent_gmail_connections').upsert(
                {
                  agent_id: userData.id,
                  email: userData.email,
                  refresh_token: provider_refresh_token,
                  needs_reauth: false,
                },
                { onConflict: 'agent_id' }
              );
              await setupGmailWatch(userData.id);
              console.log('[Auth] Gmail connected for agent');
            } catch (gmailErr) {
              console.error('[Auth] Gmail setup error (non-fatal):', gmailErr);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Auth] Google sign-in failed:', error);
      throw error;
    }
  };

  const signInAsGuest = async (name: string, email: string) => {
    // Note: SecureStore doesn't support getAllKeys, so old guest histories
    // remain until explicitly cleared on signout

    const guestUser: GuestUser = {
      id: `guest_${randomUUID()}`,
      name,
      email,
      role: 'guest',
    };

    await SecureStore.setItemAsync(GUEST_USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
  };

  const signOut = async () => {
    try {
      if (user?.role === 'guest') {
        await SecureStore.deleteItemAsync(`guest_waitlist_history_${user.id}`);
      }

      await supabase.auth.signOut();

      // Clean up secure storage
      await Promise.all([
        SecureStore.deleteItemAsync(GUEST_USER_KEY).catch(e => console.error('[Auth] cleanup:', e)),
        SecureStore.deleteItemAsync('openhouse_oauth_role').catch(e => console.error('[Auth] cleanup:', e)),
        SecureStore.deleteItemAsync('openhouse_current_role').catch(e => console.error('[Auth] cleanup:', e)),
      ]);

      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('[Auth] Error signing out:', error);
      throw error;
    }
  };

  const deleteAccount = async () => {
    if (!user) throw new Error('No user logged in');

    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw new Error('Failed to delete account');
    } else {
      throw new Error('No active authentication session');
    }

    // Clean up secure storage
    await Promise.all([
      SecureStore.deleteItemAsync(GUEST_USER_KEY).catch(e => console.error('[Auth] cleanup:', e)),
      SecureStore.deleteItemAsync('openhouse_oauth_role').catch(e => console.error('[Auth] cleanup:', e)),
      SecureStore.deleteItemAsync('openhouse_current_role').catch(e => console.error('[Auth] cleanup:', e)),
    ]);

    await signOut();
  };

  const refreshUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadUserProfile(session.user);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isGuest: user?.role === 'guest',
      isAuthenticated: (session !== null) && user?.role !== 'guest',
      loading,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInAsGuest,
      signOut,
      deleteAccount,
      refreshUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
