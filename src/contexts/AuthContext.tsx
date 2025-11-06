/**
 * Authentication Context
 * Handles both guest users (quick join) and authenticated users (Supabase)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { User, GuestUser, UserRole } from '../types';

interface AuthContextType {
  // Current user state
  user: User | GuestUser | null;
  session: Session | null;
  isGuest: boolean;
  isAuthenticated: boolean;
  loading: boolean;

  // Guest auth methods
  signInAsGuest: (name: string, phone: string) => Promise<void>;

  // Supabase auth methods
  signUp: (email: string, password: string, name: string, role: UserRole) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Conversion from guest to authenticated
  convertGuestToUser: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GUEST_USER_KEY = '@openhouse:guest_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | GuestUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Load guest user from storage on mount
  useEffect(() => {
    loadGuestUser();
    loadSession();
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await loadUserProfile(session.user);
        } else {
          // If logged out, check for guest user
          await loadGuestUser();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session?.user) {
        await loadUserProfile(session.user);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (supabaseUser: SupabaseUser) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) throw error;

      setUser(data as User);
      // Clear guest user if exists
      await AsyncStorage.removeItem(GUEST_USER_KEY);
    } catch (error) {
      console.error('Error loading user profile:', error);
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
      console.error('Error loading guest user:', error);
    } finally {
      setLoading(false);
    }
  };

  const signInAsGuest = async (name: string, phone: string) => {
    try {
      const guestUser: GuestUser = {
        id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        phone,
        role: 'guest',
      };

      await AsyncStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
      setUser(guestUser);
    } catch (error) {
      console.error('Error signing in as guest:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string, role: UserRole) => {
    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from signup');

      // Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          role,
        });

      if (profileError) throw profileError;

      // Load the new user profile
      await loadUserProfile(authData.user);
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(GUEST_USER_KEY);
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const convertGuestToUser = async (email: string, password: string) => {
    if (!user || user.role !== 'guest') {
      throw new Error('No guest user to convert');
    }

    try {
      const guestUser = user as GuestUser;

      // Create authenticated account
      await signUp(email, password, guestUser.name, 'tenant');

      // Guest user will be cleared automatically in loadUserProfile
    } catch (error) {
      console.error('Error converting guest to user:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    session,
    isGuest: user?.role === 'guest',
    isAuthenticated: session !== null && user?.role !== 'guest',
    loading,
    signInAsGuest,
    signUp,
    signIn,
    signOut,
    convertGuestToUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
