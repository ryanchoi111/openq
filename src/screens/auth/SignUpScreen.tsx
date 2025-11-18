/**
 * Sign Up Screen - Clerk Implementation
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp, useOAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { supabase } from '../../config/supabase';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startMicrosoftOAuth } = useOAuth({ strategy: 'oauth_microsoft' });
  const { refreshUserProfile } = useAuth();
  
  const [name, setName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('tenant');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle submission of sign-up form
  const handleSignUp = async () => {
    if (!isLoaded) {
      Alert.alert('Loading', 'Please wait...');
      return;
    }

    if (!name.trim() || !emailAddress.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Start sign-up process using email and password provided
      await signUp.create({
        emailAddress: emailAddress.trim(),
        password,
        firstName: name.trim().split(' ')[0],
        lastName: name.trim().split(' ').slice(1).join(' ') || '',
      });

      // Send user an email with verification code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // Set 'pendingVerification' to true to display second form
      // and capture OTP code
      setPendingVerification(true);
    } catch (err: any) {
      // See https://clerk.com/docs/guides/development/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
      const errorMessage = err.errors?.[0]?.message || err.message || 'Sign-up failed. Please try again.';
      setError(errorMessage);
      Alert.alert('Sign Up Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle submission of verification form
  const handleVerify = async () => {
    if (!isLoaded) {
      Alert.alert('Loading', 'Please wait...');
      return;
    }

    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Use the code the user provided to attempt verification
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      // If verification was completed, set the session to active
      if (signUpAttempt.status === 'complete') {
        await setActive({ session: signUpAttempt.createdSessionId });

        // Sync user with Supabase database
        const clerkUser = signUpAttempt.createdUserId;
        if (clerkUser) {
          // Create user profile in Supabase
          const { error: supabaseError } = await supabase
            .from('users')
            .upsert({
              id: clerkUser,
              email: emailAddress.trim(),
              name: name.trim(),
              role: role,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (supabaseError) {
            console.error('Error syncing user to Supabase:', supabaseError);
          }

          // Refresh user profile
          await refreshUserProfile();
        }
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error(JSON.stringify(signUpAttempt, null, 2));
        Alert.alert('Verification Incomplete', 'Please complete all required steps');
      }
    } catch (err: any) {
      // See https://clerk.com/docs/guides/development/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
      const errorMessage = err.errors?.[0]?.message || err.message || 'Invalid code';
      setError(errorMessage);
      Alert.alert('Verification Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignUp = async (strategy: 'oauth_google' | 'oauth_microsoft') => {
    if (!isLoaded) {
      Alert.alert('Loading', 'Please wait...');
      return;
    }

    try {
      setLoading(true);
      
      // Store the role temporarily so we can assign it after OAuth completes
      await AsyncStorage.setItem('@openhouse:oauth_role', role);
      
      const startOAuth = strategy === 'oauth_google' ? startGoogleOAuth : startMicrosoftOAuth;
      
      const result = await startOAuth();

      if (result.createdSessionId) {
        // Set the active session using the OAuth result's setActive
        if (result.setActive) {
          await result.setActive({ session: result.createdSessionId });
        }

        // Wait a moment for user data to be available
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get user ID from the result
        // Note: createdUserId might not be in the result, we'll get it from Clerk user hook
        // For now, we'll sync after refreshUserProfile gets the user data
        
        // Refresh user profile - this will fetch the actual user data from Clerk and sync with Supabase
        await refreshUserProfile();
      }
    } catch (error: any) {
      console.error('OAuth sign up error:', error);
      await AsyncStorage.removeItem('@openhouse:oauth_role');
      if (error.errors?.[0]?.code !== 'form_identifier_exists') {
        Alert.alert(
          'Sign Up Failed',
          error.errors?.[0]?.message || error.message || `Failed to sign in with ${strategy === 'oauth_google' ? 'Google' : 'Microsoft'}`
        );
      }
      // If user already exists, they'll be signed in automatically
    } finally {
      setLoading(false);
    }
  };

  // Show verification form if pending verification
  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              We sent a verification code to {emailAddress}
            </Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Enter your verification code"
                keyboardType="number-pad"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => {
                setPendingVerification(false);
                setCode('');
                setError('');
              }}
            >
              <Text style={styles.linkText}>
                <Text style={styles.linkBold}>Back to sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join OpenHouse today</Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>I am a...</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === 'tenant' && styles.roleButtonActive,
                  ]}
                  onPress={() => setRole('tenant')}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === 'tenant' && styles.roleButtonTextActive,
                    ]}
                  >
                    Tenant
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === 'agent' && styles.roleButtonActive,
                  ]}
                  onPress={() => setRole('agent')}
                >
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === 'agent' && styles.roleButtonTextActive,
                    ]}
                  >
                    Agent
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="John Doe"
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="Enter email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password (min. 8 characters)"
                secureTextEntry
                autoComplete="password-new"
                editable={!loading}
              />
            </View>

            {role === 'agent' && (
              <View style={styles.oauthContainer}>
                <Text style={styles.oauthLabel}>Or sign up with:</Text>
                <View style={styles.oauthButtons}>
                  <TouchableOpacity
                    style={[styles.oauthButton, styles.googleButton]}
                    onPress={() => handleOAuthSignUp('oauth_google')}
                    disabled={loading}
                  >
                    <Ionicons name="logo-google" size={20} color="#fff" />
                    <Text style={styles.oauthButtonText}>Google</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.oauthButton, styles.microsoftButton]}
                    onPress={() => handleOAuthSignUp('oauth_microsoft')}
                    disabled={loading}
                  >
                    <Ionicons name="logo-microsoft" size={20} color="#fff" />
                    <Text style={styles.oauthButtonText}>Microsoft</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text style={styles.linkText}>
                Already have an account?{' '}
                <Text style={styles.linkBold}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  roleButtonTextActive: {
    color: '#2563eb',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    padding: 8,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
    color: '#64748b',
  },
  linkBold: {
    color: '#2563eb',
    fontWeight: '600',
  },
  backButton: {
    marginTop: 20,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#2563eb',
  },
  oauthContainer: {
    marginTop: 8,
    gap: 12,
  },
  oauthLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  oauthButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  oauthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  microsoftButton: {
    backgroundColor: '#00A4EF',
  },
  oauthButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
});

export default SignUpScreen;
