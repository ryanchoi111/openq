/**
 * Authentication Context
 * Pure Supabase Auth with Google OAuth support
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../config/supabase';
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
const GUEST_USER_KEY = '@openhouse:guest_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | GuestUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    loadSession();
  }, []);

  // Listen to Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event);
      console.log('[Auth] Session user:', session?.user?.id);
      setSession(session);

      // Only load profile for non-OAuth events (initial session, token refresh, etc.)
      // OAuth flow handles profile loading directly
      if (session?.user && event !== 'SIGNED_IN') {
        console.log('[Auth] onAuthStateChange calling loadUserProfile...');
        await loadUserProfile(session.user);
      } else {
        console.log('[Auth] Skipping loadUserProfile in listener (OAuth or no session)');
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
      console.log('[Auth] loadUserProfile called for user:', supabaseUser.id);

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      console.log('[Auth] Profile query result:', { data, error });

      if (error) {
        if (retries > 0 && (error.code === 'PGRST116' || error.code === 'PGRST301')) {
          console.log(`[Auth] Profile not found, retrying... (${retries} left)`);
          await new Promise(r => setTimeout(r, 500));
          return loadUserProfile(supabaseUser, retries - 1);
        }
        throw error;
      }

      console.log('[Auth] Setting user state to:', data);
      setUser(data as User);
      await AsyncStorage.removeItem(GUEST_USER_KEY);
      console.log('[Auth] User state updated!');
    } catch (error) {
      console.error('[Auth] Error loading user profile:', error);
      throw error;
    }
  };

  const loadGuestUser = async () => {
    try {
      const guestData = await AsyncStorage.getItem(GUEST_USER_KEY);
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string, name: string, role: UserRole) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
        },
      },
    });

    if (error) throw error;
  };

  const signInWithGoogle = async (role?: UserRole) => {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 [AuthContext] signInWithGoogle STARTED');
    console.log('[AuthContext] Role parameter:', role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Step 1: Store role in AsyncStorage for after OAuth redirect
      if (role) {
        console.log('[AuthContext] Step 1: Storing role in AsyncStorage:', role);
        await AsyncStorage.setItem('@openhouse:oauth_role', role);
      }

      // Step 2: Generate redirect URI
      console.log('[AuthContext] Step 2: Generating redirect URI...');
      const redirectUri = AuthSession.makeRedirectUri();
      console.log('[AuthContext] ✓ Redirect URI:', redirectUri);

      // Step 3: Create OAuth request
      console.log('[AuthContext] Step 3: Creating OAuth request...');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
        },
      });

      if (error || !data?.url) {
        throw error || new Error('No OAuth URL generated');
      }
      console.log('[AuthContext] ✓ OAuth URL generated:', data.url);

      // Step 4: Open browser for OAuth
      console.log('[AuthContext] Step 4: Opening browser for OAuth...');
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri
      );
      console.log('[AuthContext] ✓ Browser returned with type:', result.type);

      if (result.type !== 'success') {
        throw new Error(result.type === 'cancel' ? 'OAuth cancelled' : 'OAuth failed');
      }

      // Step 5: Extract tokens from redirect URL
      console.log('[AuthContext] Step 5: Extracting tokens from redirect URL...');
      const url = new URL(result.url);
      const access_token = url.searchParams.get('access_token') ||
        new URLSearchParams(url.hash.substring(1)).get('access_token');
      const refresh_token = url.searchParams.get('refresh_token') ||
        new URLSearchParams(url.hash.substring(1)).get('refresh_token');

      console.log('[AuthContext] ✓ Tokens extracted:', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        accessTokenLength: access_token?.length,
        refreshTokenLength: refresh_token?.length,
      });

      if (!access_token || !refresh_token) {
        throw new Error('No tokens found in OAuth response');
      }

      // Step 6: Set Supabase session
      console.log('[AuthContext] Step 6: Setting Supabase session...');
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) throw sessionError;
      console.log('[AuthContext] ✓ Session set successfully');
      console.log('[AuthContext] User ID:', sessionData.user?.id);

      // Step 7: Wait for session propagation
      console.log('[AuthContext] Step 7: Waiting 500ms for session to propagate...');
      await new Promise(r => setTimeout(r, 500));
      console.log('[AuthContext] ✓ Wait complete');

      // Step 8: Load user profile
      if (sessionData.user) {
        console.log('[AuthContext] Step 8: Loading user profile from database...');
        console.log('[AuthContext] Querying for user ID:', sessionData.user.id);

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', sessionData.user.id)
          .single();

        console.log('[AuthContext] ✓ Profile query completed');
        console.log('[AuthContext] User data:', userData ? {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
        } : null);
        console.log('[AuthContext] User error:', userError);

        if (userError) {
          console.error('[AuthContext] ❌ Failed to load profile:', userError);
          throw userError;
        }

        if (userData) {
          // Step 9: Update role if user selected different role than trigger default
          const storedRole = await AsyncStorage.getItem('@openhouse:oauth_role') as UserRole | null;
          console.log('[AuthContext] Step 9: Checking role - Stored:', storedRole, 'DB:', userData.role);

          if (storedRole && userData.role !== storedRole) {
            console.log('[AuthContext] Updating role from', userData.role, 'to', storedRole);
            const { error: updateError } = await supabase
              .from('users')
              .update({ role: storedRole })
              .eq('id', userData.id);

            if (updateError) {
              console.error('[AuthContext] ❌ Failed to update role:', updateError);
            } else {
              userData.role = storedRole;
              console.log('[AuthContext] ✓ Role updated to:', storedRole);
            }
          } else {
            console.log('[AuthContext] Role matches, no update needed');
          }

          // Clean up AsyncStorage
          await AsyncStorage.removeItem('@openhouse:oauth_role');
          console.log('[AuthContext] ✓ OAuth role cleared from storage');

          console.log('[AuthContext] Step 10: Setting user state...');
          setUser(userData as User);
          await AsyncStorage.removeItem(GUEST_USER_KEY);
          console.log('[AuthContext] ✓ User state set!');
          console.log('[AuthContext] ✓ Auth state should trigger navigation now');
        }
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ [AuthContext] signInWithGoogle COMPLETED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
    } catch (error) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ [AuthContext] signInWithGoogle FAILED');
      console.error('[AuthContext] Error:', error);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      throw error;
    }
  };

  const signInAsGuest = async (name: string, email: string) => {
    const allKeys = await AsyncStorage.getAllKeys();
    const guestHistoryKeys = allKeys.filter(key => key.startsWith('@guest_waitlist_history:'));
    if (guestHistoryKeys.length > 0) {
      await AsyncStorage.multiRemove(guestHistoryKeys);
    }

    const guestUser: GuestUser = {
      id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name,
      email,
      role: 'guest',
    };

    await AsyncStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
  };

  const signOut = async () => {
    try {
      if (user?.role === 'guest') {
        await AsyncStorage.removeItem(`@guest_waitlist_history:${user.id}`);
      }

      await supabase.auth.signOut();

      await AsyncStorage.multiRemove([
        GUEST_USER_KEY,
        '@openhouse:oauth_role',
        '@openhouse:current_role',
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
      if (error) throw new Error(`Failed to delete account: ${error.message}`);
    } else {
      throw new Error('No active authentication session');
    }

    await AsyncStorage.multiRemove([
      GUEST_USER_KEY,
      '@openhouse:oauth_role',
      '@openhouse:current_role',
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
