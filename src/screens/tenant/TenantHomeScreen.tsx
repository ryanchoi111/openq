import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TenantStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';

type Props = NativeStackScreenProps<TenantStackParamList, 'TenantHome'>;

const TenantHomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user, isGuest, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      // Navigation handled by AppNavigator based on auth state
    } catch (error) {
      Alert.alert('Error', 'Failed to log out. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome, {user?.name}!</Text>
        {isGuest && (
          <Text style={styles.subtitle}>Signed in as guest</Text>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('ScanQR')}
        >
          <Text style={styles.buttonText}>Scan QR Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('TenantHistory')}
        >
          <Text style={styles.secondaryButtonText}>View My History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, padding: 20, justifyContent: 'center', gap: 16 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center' },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f1f5f9' },
  secondaryButtonText: { color: '#334155', fontSize: 16, fontWeight: '600' },
  logoutButton: { backgroundColor: '#ef4444' },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default TenantHomeScreen;
