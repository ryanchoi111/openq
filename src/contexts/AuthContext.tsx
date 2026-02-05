/**
 * Authentication Context
 * Handles guest users and Clerk-authenticated users with Supabase profile sync
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo';
import { supabase } from '../config/supabase';
import { User, GuestUser, UserRole } from '../types';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
  user: User | GuestUser | null;
  session: Session | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  /**
   * Fast role source used for routing immediately after Clerk OAuth completes.
   * Prefers:
   * - Supabase profile role (when loaded)
   * - Clerk `publicMetadata.role`
   */
  effectiveRole: UserRole | null;
  signInAsGuest: (name: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const GUEST_USER_KEY = '@openhouse:guest_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const clerkAuth = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const { isSignedIn, signOut: clerkSignOut } = clerkAuth;
  const [user, setUser] = useState<User | GuestUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [effectiveRole, setEffectiveRole] = useState<UserRole | null>(null);

  const getClerkRole = (clerkUserData: any): UserRole | null => {
    const role = clerkUserData?.publicMetadata?.role;
    return (role === 'agent' || role === 'tenant' || role === 'guest') ? role : null;
  };

  // Initialize auth state
  useEffect(() => {
    loadGuestUser();
    loadSession();
    if (isSignedIn && clerkUser) {
      syncClerkUserToSupabase(clerkUser).catch(async (e) => {
        if (e.message?.includes('EMAIL_EXISTS_DIFFERENT_ROLE')) {
          const existingRole = e.message.split(':')[1];
          const roleDisplay = existingRole?.charAt(0).toUpperCase() + existingRole?.slice(1) || 'another role';
          Alert.alert(
            'Account Already Exists',
            `This email is already registered as ${roleDisplay}. Please sign in with your existing account or use a different email.`
          );
          console.log('[Auth] Role mismatch - signing out');
          try { if (clerkSignOut) await clerkSignOut(); } catch {}
          setUser(null);
          setEffectiveRole(null);
        }
      });
    }
  }, [isSignedIn, clerkUser]);

  // Resolve effective role for routing
  useEffect(() => {
    if (!isSignedIn) {
      setEffectiveRole(null);
      return;
    }
    if (user && (user as any).role && (user as any).role !== 'guest') {
      setEffectiveRole((user as any).role as UserRole);
      return;
    }
    const clerkRole = getClerkRole(clerkUser);
    setEffectiveRole(clerkRole);
  }, [isSignedIn, clerkUser, user]);

  // Listen to Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setSession(session);
      if (session?.user) await loadUserProfile(session.user);
      else await loadGuestUser();
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) await loadUserProfile(session.user);
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (supabaseUser: SupabaseUser, retries = 3) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && retries > 0) {
        await new Promise(r => setTimeout(r, 300));
        return loadUserProfile(supabaseUser, retries - 1);
      }
      if (!session) throw new Error('No active session');

      const { data, error } = await supabase.from('users').select('*').eq('id', supabaseUser.id).single();
      if (error) {
        if (retries > 0 && (error.code === 'PGRST116' || error.code === 'PGRST301')) {
          await new Promise(r => setTimeout(r, 500));
          return loadUserProfile(supabaseUser, retries - 1);
        }
        throw error;
      }
      setUser(data as User);
      await AsyncStorage.removeItem(GUEST_USER_KEY);
      setLoading(false);
    } catch (error) {
      console.error('Error loading user profile:', error);
      if (retries === 0) setLoading(false);
      throw error;
    }
  };

  const loadGuestUser = async () => {
    try {
      const guestData = await AsyncStorage.getItem(GUEST_USER_KEY);
      setUser(guestData ? JSON.parse(guestData) as GuestUser : null);
    } catch (error) {
      console.error('Error loading guest user:', error);
    } finally {
      setLoading(false);
    }
  };

  const signInAsGuest = async (name: string, email: string) => {
    // Clear previous guest history
    const allKeys = await AsyncStorage.getAllKeys();
    const guestHistoryKeys = allKeys.filter(key => key.startsWith('@guest_waitlist_history:'));
    if (guestHistoryKeys.length > 0) await AsyncStorage.multiRemove(guestHistoryKeys);

    const guestUser: GuestUser = {
      id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name, email, role: 'guest',
    };
    await AsyncStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
  };

  const signOut = async () => {
    try {
      if (user?.role === 'guest') {
        await AsyncStorage.removeItem(`@guest_waitlist_history:${user.id}`);
      }
      if (isSignedIn && clerkSignOut) await clerkSignOut();
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(GUEST_USER_KEY);
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const syncClerkUserToSupabase = async (clerkUserData: any) => {
    if (!clerkUserData?.id) return;

    const email = clerkUserData.primaryEmailAddress?.emailAddress || clerkUserData.emailAddresses?.[0]?.emailAddress || '';
    const storedRole = await AsyncStorage.getItem('@openhouse:oauth_role');
    const desiredRole = (storedRole as UserRole) || 'tenant';

    // Check if user exists with this Clerk ID
    const { data: existingUser } = await supabase.from('users').select('*').eq('id', clerkUserData.id).single();

    let userRole: UserRole;
    if (existingUser) {
      if (storedRole && existingUser.role !== desiredRole) {
        await AsyncStorage.removeItem('@openhouse:oauth_role');
        throw new Error(`EMAIL_EXISTS_DIFFERENT_ROLE:${existingUser.role}`);
      }
      userRole = existingUser.role as UserRole;
    } else {
      // Check if email exists with different account
      const { data: emailCheck } = await supabase.from('users').select('*').eq('email', email).single();
      if (emailCheck) {
        await AsyncStorage.removeItem('@openhouse:oauth_role');
        throw new Error(`EMAIL_EXISTS_DIFFERENT_ROLE:${emailCheck.role}`);
      }
      userRole = desiredRole;
    }

    // Update Clerk metadata
    try {
      if (typeof clerkUserData.update === 'function') {
        await clerkUserData.update({ publicMetadata: { role: userRole } });
      }
    } catch {}

    // Set user optimistically
    const userName = (clerkUserData.firstName && clerkUserData.lastName)
      ? `${clerkUserData.firstName} ${clerkUserData.lastName}`
      : clerkUserData.firstName || clerkUserData.lastName || clerkUserData.username || 'User';

    setUser({
      id: clerkUserData.id,
      email,
      name: userName,
      role: userRole,
      created_at: existingUser?.created_at || new Date().toISOString(),
    });
    setEffectiveRole(userRole);
    await AsyncStorage.setItem('@openhouse:current_role', userRole);

    // Sync to Supabase
    const { error } = await supabase.from('users').upsert({
      id: clerkUserData.id,
      email,
      name: userName,
      role: userRole,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) {
      console.error('[Auth] Error syncing to Supabase:', error);
    } else {
      await AsyncStorage.removeItem('@openhouse:oauth_role');
      // Load canonical profile
      const { data } = await supabase.from('users').select('*').eq('id', clerkUserData.id).single();
      if (data) {
        setUser(data as User);
        await AsyncStorage.setItem('@openhouse:current_role', data.role);
      }
    }
  };

  const refreshUserProfile = async () => {
    if (isSignedIn && clerkUser) {
      await syncClerkUserToSupabase(clerkUser);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await loadUserProfile(session.user);
    }
  };

  const deleteAccount = async () => {
    if (!user) throw new Error('No user logged in');

    const { error: supabaseError } = await supabase.from('users').delete().eq('id', user.id);
    if (supabaseError) throw new Error('Failed to delete account from database');

    if (isSignedIn && clerkUser) {
      try { await clerkUser.delete(); } catch {}
    }

    await AsyncStorage.multiRemove([GUEST_USER_KEY, '@openhouse:oauth_role', '@openhouse:current_role']);
    await signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isGuest: user?.role === 'guest',
      isAuthenticated: isSignedIn || ((session !== null) && user?.role !== 'guest'),
      loading,
      effectiveRole,
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
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
