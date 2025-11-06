/**
 * Scan QR Screen
 * Scan QR code to join open house waitlist
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { TenantStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { waitlistService } from '../../services/waitlistService';

type Props = NativeStackScreenProps<TenantStackParamList, 'ScanQR'>;

const ScanQRScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ type, data }: any) => {
    setScanned(true);

    // Parse QR code data: openhouse://join/{eventId}
    const match = data.match(/openhouse:\/\/join\/(.+)/);
    if (!match) {
      Alert.alert('Invalid QR Code', 'This does not appear to be an OpenHouse QR code.');
      setTimeout(() => setScanned(false), 2000);
      return;
    }

    const eventId = match[1];

    try {
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      // Join waitlist
      const entry = await waitlistService.joinWaitlist({ eventId, user });

      // Navigate to waitlist view
      navigation.replace('WaitlistView', { eventId, entryId: entry.id });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to join waitlist');
      setTimeout(() => setScanned(false), 2000);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No access to camera</Text>
        <Text style={styles.subtitle}>
          Please enable camera permissions in Settings
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={styles.scanArea} />
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          <Text style={styles.instructionText}>
            Position QR code within the frame
          </Text>
          {scanned && (
            <TouchableOpacity
              style={styles.button}
              onPress={() => setScanned(false)}
            >
              <Text style={styles.buttonText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
  overlay: {
    flex: 1,
    width: '100%',
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 250,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 12,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ScanQRScreen;
