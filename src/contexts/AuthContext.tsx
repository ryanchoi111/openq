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

  const loadUserProfile = async (supabaseUser: SupabaseUser, retries = 10) => {
    try {
      // Check for session, but don't throw error immediately - try to get it
      let session = null;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      session = currentSession;

      // If no session, try one more time after a short wait
      if (!session && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        session = retrySession;
      }

      // If still no session, throw error (but only if we've exhausted retries)
      if (!session) {
        if (retries > 0) {
          // Retry getting session
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadUserProfile(supabaseUser, retries - 1);
        }
        throw new Error('No active session - please sign in');
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) {
        // Handle 406 errors (Not Acceptable) - might be a header/session issue
        if (error.code === 'PGRST301' || error.message?.includes('406')) {
          // Wait a bit and retry - might be a timing issue with session
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
            return loadUserProfile(supabaseUser, retries - 1);
          }
        }
        // Retry if profile not found yet (trigger might still be running)
        if (retries > 0 && (error.code === 'PGRST116' || error.code === 'PGRST301')) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return loadUserProfile(supabaseUser, retries - 1);
        }
        throw error;
      }

      setUser(data as User);
      // Clear guest user if exists
      await AsyncStorage.removeItem(GUEST_USER_KEY);
      
      // IMPORTANT: Set loading to false after successfully loading user profile
      setLoading(false);
    } catch (error) {
      console.error('Error loading user profile:', error);
      // Only set loading to false if we've exhausted all retries
      if (retries === 0) {
        setLoading(false);
      }
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
      console.error('Error loading guest user:', error);
    } finally {
      setLoading(false);
    }
  };

  const signInAsGuest = async (name: string, phone: string) => {
    try {
      const guestUser: GuestUser = {
        id: `guest_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
      // Note: If email confirmation is disabled in Supabase dashboard,
      // this will automatically return a session
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Don't redirect for mobile app
          data: {
            name,
            role,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned from signup');

      // Check if signup returned a session (depends on email confirmation settings)
      const hasSession = !!authData.session;
      
      // If we have a session, set it immediately and ensure it's available
      if (authData.session) {
        setSession(authData.session);
        // Ensure the session is set in the Supabase client
        await supabase.auth.setSession(authData.session);
      } else {
        // No session from signup - wait for it to become available
        let sessionWaitAttempts = 0;
        while (!authData.session && sessionWaitAttempts < 5) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.user?.id === authData.user.id) {
            setSession(session);
            break;
          }
          sessionWaitAttempts++;
        }
      }

      // Ensure we have a valid session before attempting profile creation
      // RLS policies require auth.uid() to be available
      let currentSession = authData.session;
      if (!currentSession) {
        const { data: { session } } = await supabase.auth.getSession();
        currentSession = session;
      }

      if (!currentSession) {
        throw new Error('No session available. Please ensure email confirmation is disabled or confirm your email first.');
      }

      // For a new account, we know the profile doesn't exist yet
      // So we'll try to create it directly with retry logic
      let profileCreated = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!profileCreated && attempts < maxAttempts) {
        // Wait a moment for auth user to be fully committed (prevents 23503 errors)
        if (attempts > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // First attempt: shorter wait since signup just completed
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Ensure session is still valid before each attempt
        const { data: { session: verifySession } } = await supabase.auth.getSession();
        if (!verifySession || verifySession.user?.id !== authData.user.id) {
          console.log('Session lost, attempting to restore...');
          if (authData.session) {
            await supabase.auth.setSession(authData.session);
          } else {
            // Wait a bit and retry getting session
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
            continue;
          }
        }

        // First, check if profile already exists (might have been created in a previous attempt)
        const { data: existingCheck } = await supabase
          .from('users')
          .select('id')
          .eq('id', authData.user.id)
          .single();
        
        if (existingCheck) {
          // Profile already exists - success!
          profileCreated = true;
          break;
        }

        // Try to create the profile directly
        const { error: profileError, data: insertData } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email,
            name,
            role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select();

        if (!profileError) {
          // Successfully created!
          profileCreated = true;
          break;
        }

        // Log the full error for debugging
        const errorInfo = {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          status: (profileError as any).status,
          statusCode: (profileError as any).statusCode,
        };
        console.log(`Profile creation attempt ${attempts + 1}/${maxAttempts}:`, errorInfo);

        // Check if this is a duplicate/conflict error (409 or 23505)
        // PostgREST returns 409 for duplicate key violations
        const isDuplicateError = 
          profileError.code === '23505' || // PostgreSQL duplicate key
          profileError.code === 'PGRST116' || // PostgREST not found (but might be conflict)
          (profileError as any).status === 409 || // HTTP 409 Conflict
          (profileError as any).statusCode === 409 || // Alternative status code property
          profileError.message?.toLowerCase().includes('duplicate') ||
          profileError.message?.toLowerCase().includes('already exists') ||
          profileError.message?.toLowerCase().includes('unique constraint') ||
          profileError.details?.toLowerCase().includes('duplicate') ||
          profileError.details?.toLowerCase().includes('already exists');

        if (isDuplicateError) {
          // Profile might already exist - verify it's actually there
          // Use a small delay to ensure database consistency
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const { data: existingProfile, error: checkError } = await supabase
            .from('users')
            .select('id')
            .eq('id', authData.user.id)
            .single();
          
          if (existingProfile) {
            // Profile exists, we're good!
            console.log('Profile already exists (duplicate error was correct)');
            profileCreated = true;
            break;
          } else {
            // False positive or timing issue - wait and retry
            console.log('Duplicate error but profile not found yet, retrying...', checkError);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        } else if (profileError.code === '23503') {
          // Foreign key constraint violation - auth user not ready yet
          // Wait and retry
          console.log(`Auth user not ready yet (attempt ${attempts + 1}/${maxAttempts}), retrying...`);
          attempts++;
          continue;
        } else if (profileError.code === '42501') {
          // RLS policy violation - session might not be available
          console.log(`RLS policy violation (attempt ${attempts + 1}/${maxAttempts}) - ensuring session is set...`);
          
          // Try to restore/refresh the session
          if (authData.session) {
            await supabase.auth.setSession(authData.session);
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              // No session available - this is a problem
              throw new Error('Cannot create profile: No authentication session available. Please ensure email confirmation is disabled or sign in first.');
            }
          }
          
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
          continue;
        } else {
          // Other unexpected error - log and retry
          console.error('Unexpected profile creation error:', profileError);
          attempts++;
          // For other errors, wait a bit before retrying
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          } else {
            // Final attempt failed - check if profile exists anyway
            const { data: finalCheck } = await supabase
              .from('users')
              .select('id')
              .eq('id', authData.user.id)
              .single();
            
            if (finalCheck) {
              // Profile exists after all!
              profileCreated = true;
              break;
            }
            
            throw new Error(`Failed to create user profile: ${profileError.message} (code: ${profileError.code})`);
          }
        }
      }

      if (!profileCreated) {
        throw new Error(
          'Failed to create user profile after multiple attempts. The auth account was created, but the profile setup failed. Please try signing in - your account may work after a moment.'
        );
      }

      // Wait a moment for the profile to be fully available
      await new Promise(resolve => setTimeout(resolve, 300));

      // Only try to load profile if we have a session
      // If email confirmation is required, session won't be available until email is confirmed
      if (hasSession || authData.session) {
        // Ensure session is available before loading profile
        let sessionReady = false;
        let sessionAttempts = 0;
        while (!sessionReady && sessionAttempts < 5) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.user?.id === authData.user.id) {
            sessionReady = true;
            setSession(session);
          } else {
            await new Promise(resolve => setTimeout(resolve, 200));
            sessionAttempts++;
          }
        }

        // Load the profile with retry logic (only if we have a session)
        if (sessionReady) {
          // The session is set, so onAuthStateChange listener will automatically
          // call loadUserProfile. We just need to wait for it to complete.
          // But set a timeout to ensure we don't wait forever
          console.log('Session ready, auth state change should load profile...');
          
          // Wait for onAuthStateChange to load the profile (max 5 seconds)
          let profileLoaded = false;
          for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 250));
            if (user && user.id === authData.user.id) {
              profileLoaded = true;
              break;
            }
          }
          
          if (!profileLoaded) {
            // Fallback: manually load if listener didn't fire
            console.log('Auth state change did not load profile, loading manually...');
            await loadUserProfile(authData.user);
          }
        } else {
          // Session not ready yet, but profile is created
          // User will need to sign in or confirm email to load profile
          console.log('Profile created but session not available. User may need to confirm email or sign in.');
        }
      } else {
        // No session from signup (email confirmation required)
        // Profile is created, but user needs to confirm email or sign in to access it
        console.log('Profile created. Please check your email to confirm your account, then sign in.');
      }
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
