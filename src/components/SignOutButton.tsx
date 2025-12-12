/**
 * Sign Out Button Component - Clerk Implementation
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useClerk } from '@clerk/clerk-expo';
import { useAuth } from '../contexts/AuthContext';

interface SignOutButtonProps {
  style?: object;
  textStyle?: object;
  text?: string;
}

export const SignOutButton: React.FC<SignOutButtonProps> = ({ 
  style, 
  textStyle, 
  text = 'Sign out' 
}) => {
  // Use `useClerk()` to access the `signOut()` function
  const { signOut } = useClerk();
  const { signOut: authContextSignOut } = useAuth();

  const handleSignOut = async () => {
    try {
      // Sign out from Clerk
      await signOut();
      
      // Also sign out from our auth context (handles Supabase and guest users)
      await authContextSignOut();
      
      // Navigation will be handled automatically by AppNavigator
      // which will detect the sign-out and redirect to Auth screens
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error('Sign out error:', {
        message: err.message,
        errors: err.errors,
        code: err.code,
        status: err.status
      });
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  return (
    <TouchableOpacity onPress={handleSignOut} style={[styles.button, style]}>
      <Text style={[styles.text, textStyle]}>{text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ef4444',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

