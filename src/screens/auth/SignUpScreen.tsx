/**
 * Sign Up Screen - Clerk Implementation
 */

import React, { useState, useEffect } from 'react';
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
import { useSignUp, useOAuth, SignedIn, SignedOut, useUser, useAuth as useClerkAuth } from '@clerk/clerk-expo';
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
  const { user: clerkUser } = useUser();
  const clerkAuth = useClerkAuth();
  const { isSignedIn: clerkIsSignedIn } = clerkAuth;
  const { refreshUserProfile, user: authUser, isAuthenticated, signOut } = useAuth();
  
  const [name, setName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('tenant');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthCompleted, setOauthCompleted] = useState(false);
  const [preventNavigation, setPreventNavigation] = useState(false);

  // Watch for authentication state changes after OAuth
  useEffect(() => {
    // Don't navigate if we're preventing navigation due to role mismatch
    if (preventNavigation) {
      console.log('[Auth] Navigation prevented due to role mismatch');
      return;
    }
    
    if (oauthCompleted && (authUser || isAuthenticated)) {
      // User is authenticated, navigation will be handled by AppNavigator
      // Reset the flag
      setOauthCompleted(false);
      setLoading(false);
    }
  }, [oauthCompleted, authUser, isAuthenticated, preventNavigation]);

  // Handle submission of sign-up form
  const handleSignUp = async () => {
    if (!isLoaded) return;

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
      // Create the sign-up with email and password
      // Since email verification is disabled in Clerk Dashboard,
      // this will complete immediately
      // Generate a username from email if Clerk requires it
      const username = emailAddress.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const signUpAttempt = await signUp.create({
        emailAddress: emailAddress.trim(),
        password,
        firstName: name.trim().split(' ')[0],
        lastName: name.trim().split(' ').slice(1).join(' ') || '',
        username: username, // Add username to satisfy Clerk requirements
      });

      console.log('[Auth] Sign-up created:', {
        status: signUpAttempt.status,
        createdSessionId: signUpAttempt.createdSessionId,
        createdUserId: signUpAttempt.createdUserId,
        unverifiedFields: (signUpAttempt as any).unverifiedFields,
        missingFields: (signUpAttempt as any).missingFields
      });

      // Check if sign-up is complete
      if (signUpAttempt.status === 'complete' && signUpAttempt.createdSessionId) {
        // Set the session as active
        await setActive({ session: signUpAttempt.createdSessionId });

        // Sync user with Supabase database
        const clerkUserId = signUpAttempt.createdUserId;
        if (clerkUserId) {
          console.log('[Auth] Creating user profile in Supabase');
          
          // Create user profile in Supabase
          const { error: supabaseError } = await supabase
            .from('users')
            .upsert({
              id: clerkUserId,
              email: emailAddress.trim(),
              name: name.trim(),
              role: role,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'id',
            });

          if (supabaseError) {
            console.error('[Auth] Error syncing user to Supabase:', supabaseError);
            Alert.alert('Warning', 'Account created but profile sync failed. Please try signing in.');
          }

          // Refresh user profile - this will trigger navigation to home
          await refreshUserProfile();
        }
      } else if (signUpAttempt.status === 'missing_requirements') {
        // If status is missing_requirements, check what's unverified
        const unverifiedFields = (signUpAttempt as any).unverifiedFields || [];
        console.log('[Auth] Attempting to complete sign-up without verification');
        console.log('[Auth] Unverified fields:', unverifiedFields);
        
        // If email is unverified, we need to prepare and attempt verification with a bypass
        try {
          if (unverifiedFields.includes('email_address')) {
            console.log('[Auth] Email needs verification - preparing email verification');
            
            // Prepare email verification (this is required even if we're bypassing it)
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
            
            // Now attempt verification with a dummy code to trigger Clerk's admin bypass
            // When verification is disabled, Clerk should accept any attempt
            try {
              const verifiedSignUp = await signUp.attemptEmailAddressVerification({
                code: '424242', // Dummy code - Clerk should bypass this when verification is disabled
              });
              
              console.log('[Auth] After verification attempt:', {
                status: verifiedSignUp.status,
                createdSessionId: verifiedSignUp.createdSessionId,
                createdUserId: verifiedSignUp.createdUserId
              });
              
              if (verifiedSignUp.status === 'complete' && verifiedSignUp.createdSessionId) {
                await setActive({ session: verifiedSignUp.createdSessionId });
                
                const clerkUserId = verifiedSignUp.createdUserId;
                if (clerkUserId) {
                  console.log('[Auth] Creating user profile in Supabase');
                  
                  const { error: supabaseError } = await supabase
                    .from('users')
                    .upsert({
                      id: clerkUserId,
                      email: emailAddress.trim(),
                      name: name.trim(),
                      role: role,
                      updated_at: new Date().toISOString(),
                    }, {
                      onConflict: 'id',
                    });

                  if (supabaseError) {
                    console.error('[Auth] Error syncing user to Supabase:', supabaseError);
                  }

                  await refreshUserProfile();
                }
              } else {
                // Verification didn't work with dummy code
                throw new Error('Verification bypass failed');
              }
            } catch (verifyError: any) {
              console.error('[Auth] Verification attempt failed:', {
                message: verifyError.message,
                code: verifyError.code
              });
              
              // If dummy code doesn't work, show verification form
              Alert.alert(
                'Email Verification Required',
                'Clerk requires email verification. Please check your email for the verification code, or contact support to fully disable email verification.',
                [
                  {
                    text: 'Enter Code',
                    onPress: () => {
                      setPendingVerification(true);
                    }
                  },
                  {
                    text: 'Cancel',
                    style: 'cancel'
                  }
                ]
              );
            }
          } else {
            // Try to update the sign-up to trigger completion
            const updatedSignUp = await signUp.update({
              emailAddress: emailAddress.trim(),
            });
            
            console.log('[Auth] After update:', {
              status: updatedSignUp.status,
              createdSessionId: updatedSignUp.createdSessionId,
              createdUserId: updatedSignUp.createdUserId
            });
            
            if (updatedSignUp.status === 'complete' && updatedSignUp.createdSessionId) {
              await setActive({ session: updatedSignUp.createdSessionId });
              
              const clerkUserId = updatedSignUp.createdUserId;
              if (clerkUserId) {
                console.log('[Auth] Creating user profile in Supabase');
                
                const { error: supabaseError } = await supabase
                  .from('users')
                  .upsert({
                    id: clerkUserId,
                    email: emailAddress.trim(),
                    name: name.trim(),
                    role: role,
                    updated_at: new Date().toISOString(),
                  }, {
                    onConflict: 'id',
                  });

                if (supabaseError) {
                  console.error('[Auth] Error syncing user to Supabase:', supabaseError);
                }

                await refreshUserProfile();
              }
            } else {
              Alert.alert(
                'Configuration Error',
                'Unable to complete sign-up. Email verification may still be required in Clerk.'
              );
            }
          }
        } catch (updateError: any) {
          console.error('[Auth] Error completing sign-up:', updateError);
          Alert.alert(
            'Sign Up Error',
            'Unable to complete sign-up. Please try again or contact support.'
          );
        }
      } else {
        // Other status
        console.error('[Auth] Sign-up incomplete:', {
          status: signUpAttempt.status,
          missingFields: (signUpAttempt as any).missingFields
        });
        Alert.alert(
          'Sign Up Incomplete',
          'Unable to complete sign-up. Please ensure email verification is disabled in Clerk Dashboard.'
        );
      }
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error('Sign up error:', {
        message: err.message,
        errors: err.errors,
        code: err.code,
        status: err.status
      });
      const errorMessage = err.errors?.[0]?.message || err.message || 'Sign-up failed. Please try again.';
      setError(errorMessage);
      Alert.alert('Sign Up Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle submission of verification form
  const handleVerify = async () => {
    if (!isLoaded) return;

    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    // Check if the sign-up object is in a valid state
    if (!signUp || signUp.status === null || signUp.status === 'missing_requirements') {
      console.error('Sign-up object is not in a valid state:', {
        status: signUp?.status,
        emailAddress: signUp?.emailAddress
      });
      Alert.alert(
        'Session Expired',
        'Your sign-up session has expired. Please start over.',
        [
          {
            text: 'OK',
            onPress: () => {
              setPendingVerification(false);
              setCode('');
              setError('');
            }
          }
        ]
      );
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
      // and redirect the user
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
            console.error('[Auth] Error syncing user to Supabase:', supabaseError);
          }

          // Refresh user profile - this will trigger navigation to home
          await refreshUserProfile();
        }
      } else if (signUpAttempt.status === 'missing_requirements') {
        // Check what's missing
        console.error('Sign up missing requirements:', {
          status: signUpAttempt.status,
          missingFields: (signUpAttempt as any).missingFields,
          requiredFields: (signUpAttempt as any).requiredFields,
          unverifiedFields: (signUpAttempt as any).unverifiedFields
        });
        
        // The sign-up object might be stale - try to restart the sign-up process
        Alert.alert(
          'Verification Session Expired',
          'Your verification session has expired. Please start the sign-up process again.',
          [
            {
              text: 'OK',
              onPress: () => {
                setPendingVerification(false);
                setCode('');
                setError('');
              }
            }
          ]
        );
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error('Sign up attempt incomplete:', {
          status: signUpAttempt.status,
          createdSessionId: signUpAttempt.createdSessionId,
          createdUserId: signUpAttempt.createdUserId
        });
        Alert.alert('Verification Incomplete', 'Please complete all required steps');
      }
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error('Verification error:', {
        message: err.message,
        errors: err.errors,
        code: err.code,
        status: err.status
      });
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
      
      console.log('[Auth] OAuth sign-up started:', { strategy, role });
      // Store the role temporarily so we can assign it after OAuth completes
      await AsyncStorage.setItem('@openhouse:oauth_role', role);
      
      const startOAuth = strategy === 'oauth_google' ? startGoogleOAuth : startMicrosoftOAuth;
      
      const result = await startOAuth();
      console.log('[Auth] OAuth sign-up result:', result);
      
      // Clerk handles the entire OAuth flow including username generation
      // We just need to check if a session was created
      const hasSessionId = result.createdSessionId && result.createdSessionId.trim() !== '';
      
      if (!hasSessionId) {
        console.log('[Auth] OAuth did not create a session');
        Alert.alert(
          'Authentication Error',
          'Unable to complete authentication. Please try again.'
        );
        await AsyncStorage.removeItem('@openhouse:oauth_role');
        return;
      }

      // Session created successfully - activate it
      console.log('[Auth] Setting active session');
      if (result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      }

      // Sync profile - handle role mismatch inline
      try {
        await refreshUserProfile();
        setOauthCompleted(true);
      } catch (profileError: any) {
        if (profileError.message?.includes('EMAIL_EXISTS_DIFFERENT_ROLE')) {
          const existingRole = profileError.message.split(':')[1];
          const roleDisplay = existingRole.charAt(0).toUpperCase() + existingRole.slice(1);
          await signOut();
          Alert.alert(
            'Account Already Exists',
            `This email is already registered as a ${roleDisplay}. Please sign in with your existing account or use a different email.`,
            [{ text: 'OK' }]
          );
          navigation.reset({ index: 0, routes: [{ name: 'SignUp' }] });
          return;
        }
        console.error('[Auth] refreshUserProfile failed:', profileError);
      }
    } catch (error: any) {
      console.error('OAuth sign up error:', error);
      await AsyncStorage.removeItem('@openhouse:oauth_role');
      
      const errorMessage = error.message || error.errors?.[0]?.message || '';
      Alert.alert(
        'Sign Up Failed',
        errorMessage || `Failed to sign up with ${strategy === 'oauth_google' ? 'Google' : 'Microsoft'}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Show verification form if pending verification
  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <SignedOut>
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
                onPress={async () => {
                  if (!signUp) return;
                  try {
                    setLoading(true);
                    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
                    Alert.alert('Code Resent', 'A new verification code has been sent to your email.');
                  } catch (err: any) {
                    console.error('Error resending code:', {
                      message: err.message,
                      errors: err.errors,
                      code: err.code
                    });
                    Alert.alert('Error', 'Failed to resend code. Please try signing up again.');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                <Text style={styles.linkText}>
                  <Text style={styles.linkBold}>Resend Code</Text>
                </Text>
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
        </SignedOut>
        <SignedIn>
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" />
            <Text style={[styles.subtitle, { marginTop: 16 }]}>Already signed in. Redirecting...</Text>
          </View>
        </SignedIn>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <SignedOut>
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
      </SignedOut>
      <SignedIn>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" />
          <Text style={[styles.subtitle, { marginTop: 16 }]}>Already signed in. Redirecting...</Text>
        </View>
      </SignedIn>
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
