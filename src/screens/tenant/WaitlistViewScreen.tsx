/**
 * Waitlist View Screen
 * Shows tenant's position in queue with realtime updates
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TenantStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { waitlistService } from '../../services/waitlistService';
import { eventService } from '../../services/eventService';
import { WaitlistEntry, OpenHouseEvent } from '../../types';

type Props = NativeStackScreenProps<TenantStackParamList, 'WaitlistView'>;

const WaitlistViewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { eventId, entryId } = route.params;
  const { user, isGuest } = useAuth();
  const [entry, setEntry] = useState<WaitlistEntry | null>(null);
  const [event, setEvent] = useState<OpenHouseEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    setupRealtimeSubscription();
  }, []);

  const loadData = async () => {
    try {
      const [entryData, eventData] = await Promise.all([
        fetchEntry(),
        eventService.getEvent(eventId),
      ]);

      setEvent(eventData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load waitlist information');
    }
  };

  const fetchEntry = async () => {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('id', entryId)
      .single();

    if (error) throw error;
    setEntry(data as WaitlistEntry);
    return data;
  };

  const setupRealtimeSubscription = () => {
    const subscription = waitlistService.subscribeToWaitlist(
      eventId,
      (payload) => {
        if (payload.new.id === entryId) {
          setEntry(payload.new as WaitlistEntry);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  };

  const handleExpressInterest = async () => {
    if (isGuest) {
      // Prompt to create account
      Alert.alert(
        'Create Account',
        'Create an account to express interest and receive application forms',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Create Account', onPress: () => {} }, // TODO: Navigate to account creation
        ]
      );
      return;
    }

    try {
      await waitlistService.expressInterest(entryId);
      Alert.alert('Success', 'Interest expressed! The agent will send you an application.');
    } catch (error) {
      Alert.alert('Error', 'Failed to express interest');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const getStatusMessage = () => {
    switch (entry?.status) {
      case 'waiting':
        return 'Waiting in line';
      case 'touring':
        return "It's your turn!";
      case 'completed':
        return 'Tour completed';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (entry?.status) {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.property}>{event?.property?.address}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
            <Text style={styles.statusText}>{getStatusMessage()}</Text>
          </View>

          <View style={styles.positionContainer}>
            <Text style={styles.positionLabel}>Your Position</Text>
            <Text style={styles.positionNumber}>#{entry?.position}</Text>
          </View>

          {entry?.status === 'touring' && (
            <View style={styles.alert}>
              <Text style={styles.alertText}>
                Please proceed to the property entrance!
              </Text>
            </View>
          )}

          {entry?.status === 'completed' && !entry.expressed_interest && (
            <TouchableOpacity
              style={styles.interestButton}
              onPress={handleExpressInterest}
            >
              <Text style={styles.interestButtonText}>
                Express Interest
              </Text>
            </TouchableOpacity>
          )}

          {entry?.expressed_interest && (
            <View style={styles.successMessage}>
              <Text style={styles.successText}>
                ✓ Interest expressed
                {entry.application_sent && ' • Application sent'}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Import supabase for direct query
import { supabase } from '../../config/supabase';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  property: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 24,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  positionContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  positionLabel: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 8,
  },
  positionNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  alert: {
    backgroundColor: '#dcfce7',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  alertText: {
    color: '#15803d',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  interestButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  interestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  successMessage: {
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  successText: {
    color: '#15803d',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
});

export default WaitlistViewScreen;
