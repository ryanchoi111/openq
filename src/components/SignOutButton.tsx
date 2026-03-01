/**
 * Sign Out Button Component - Supabase Auth Implementation
 */

import React from 'react';
import { Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
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
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      // Navigation handled automatically by AppNavigator
    } catch (err: any) {
      console.error('[SignOut] Error:', err);
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

