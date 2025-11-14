/**
 * Event Dashboard - Manage waitlist queue
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { waitlistService } from '../../services/waitlistService';
import { WaitlistEntry } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'EventDashboard'>;

const EventDashboardScreen: React.FC<Props> = ({ route, navigation }) => {
  const { eventId } = route.params;
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);

  useEffect(() => {
    loadWaitlist();
    const subscription = waitlistService.subscribeToWaitlist(eventId, () => {
      loadWaitlist();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadWaitlist = async () => {
    const data = await waitlistService.getWaitlist(eventId);
    // Filter out completed tours - they should appear in the Completed Tours screen
    const activeQueue = data.filter((entry) => entry.status !== 'completed');
    setWaitlist(activeQueue);
  };

  const handleCallNext = async () => {
    const nextPerson = waitlist.find((e) => e.status === 'waiting');
    if (!nextPerson) {
      Alert.alert('Queue Empty', 'No one waiting');
      return;
    }

    await waitlistService.updateEntryStatus(nextPerson.id, 'touring');
    // TODO: Send push notification
  };

  const handleComplete = async (entryId: string) => {
    await waitlistService.updateEntryStatus(entryId, 'completed');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.qrButton}
          onPress={() => {
            // Reset navigation stack so back button goes to AgentHome
            navigation.reset({
              index: 1,
              routes: [
                { name: 'AgentTabs' },
                { name: 'QRDisplay', params: { eventId } },
              ],
            });
          }}
        >
          <Text style={styles.qrButtonText}>Show QR Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.callButton} onPress={handleCallNext}>
          <Text style={styles.callButtonText}>Call Next</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.completedToursButtonContainer}>
        <TouchableOpacity
          style={styles.completedToursButton}
          onPress={() => navigation.navigate('CompletedTours', { eventId })}
        >
          <Ionicons name="checkmark-done-circle" size={20} color="#10b981" />
          <Text style={styles.completedToursButtonText}>View Completed Tours</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={waitlist}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardContent}>
              <Text style={styles.position}>#{item.position}</Text>
              <View style={styles.info}>
                <Text style={styles.name}>{item.guest_name || 'User'}</Text>
                {item.guest_phone && <Text style={styles.phone}>{item.guest_phone}</Text>}
                <Text style={styles.phone}>{item.guest_email || 'N/A'}</Text>
                <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
                  {item.status}
                </Text>
              </View>
              {item.expressed_interest && (
                <View style={styles.starContainer}>
                  <Ionicons name="star" size={24} color="#fbbf24" />
                </View>
              )}
            </View>
            {item.status === 'touring' && (
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => handleComplete(item.id)}
              >
                <Text style={styles.completeButtonText}>Complete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'waiting':
      return '#f59e0b';
    case 'touring':
      return '#10b981';
    case 'completed':
      return '#6b7280';
    default:
      return '#6b7280';
  }
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', padding: 16, gap: 12 },
  qrButton: { flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  qrButtonText: { color: '#334155', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  callButton: { flex: 1, backgroundColor: '#2563eb', padding: 14, borderRadius: 8 },
  callButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  completedToursButtonContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  completedToursButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#fff', 
    padding: 12, 
    borderRadius: 8, 
    borderWidth: 2, 
    borderColor: '#10b981',
    gap: 8,
  },
  completedToursButtonText: { color: '#10b981', fontSize: 16, fontWeight: '600' },
  list: { padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12 },
  cardContent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  position: { fontSize: 24, fontWeight: 'bold', color: '#2563eb' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  phone: { fontSize: 14, color: '#64748b', marginTop: 2 },
  status: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  completeButton: { backgroundColor: '#10b981', padding: 12, borderRadius: 6, marginTop: 12 },
  completeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  starContainer: { marginLeft: 8 },
});

export default EventDashboardScreen;
