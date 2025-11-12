/**
 * QR Display Screen - Shows QR code for guests to scan
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { AgentStackParamList } from '../../navigation/types';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'QRDisplay'>;

const QRDisplayScreen: React.FC<Props> = ({ route }) => {
  const { eventId } = route.params;
  const [event, setEvent] = useState<OpenHouseEvent | null>(null);

  useEffect(() => {
    loadEvent();
  }, []);

  const loadEvent = async () => {
    const data = await eventService.getEvent(eventId);
    setEvent(data);
  };

  if (!event) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Scan to Join Waitlist</Text>
        <Text style={styles.property}>
          {event.property?.address}
          {event.property?.address2 ? ` ${event.property.address2}` : ''}
        </Text>

        <View style={styles.qrContainer}>
          {event.qr_code && (
            <QRCode value={event.qr_code} size={280} backgroundColor="#fff" />
          )}
        </View>

        <Text style={styles.instructions}>
          Guests can scan this QR code to join the waitlist
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
  property: { fontSize: 16, color: '#64748b', marginBottom: 40 },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  instructions: {
    marginTop: 40,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});

export default QRDisplayScreen;
