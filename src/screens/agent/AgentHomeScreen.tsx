import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'AgentHome'>;

const AgentHomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [scheduledEvents, setScheduledEvents] = useState<OpenHouseEvent[]>([]);
  const [activeEvents, setActiveEvents] = useState<OpenHouseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reload all events whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
    }, [user?.id])
  );

  const loadAllEvents = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { scheduled, active } = await eventService.getEventsByAgent(user.id);
      setScheduledEvents(scheduled);
      setActiveEvents(active);
    } catch (error) {
      console.error('Error loading events:', error);
      setScheduledEvents([]);
      setActiveEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!user?.id) return;
    try {
      setRefreshing(true);
      const { scheduled, active } = await eventService.getEventsByAgent(user.id);
      setScheduledEvents(scheduled);
      setActiveEvents(active);
    } catch (error) {
      console.error('Error refreshing events:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, propertyAddress?: string) => {
    Alert.alert(
      'Delete Open House',
      `Are you sure you want to delete this open house${propertyAddress ? ` at ${propertyAddress}` : ''}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await eventService.deleteEvent(eventId);
              Alert.alert('Success', 'Open house deleted successfully');
              // Reload the events list
              loadAllEvents();
            } catch (error: any) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', error.message || 'Failed to delete open house');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Scheduled Open Houses Section */}
        {scheduledEvents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Scheduled Open Houses ({scheduledEvents.length})
            </Text>
            {scheduledEvents.map((event) => (
              <View key={event.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardTitle}>Scheduled Open House</Text>
                    <Text style={styles.property}>
                      {event.property?.address}
                      {event.property?.address2 ? ` ${event.property.address2}` : ''}
                    </Text>
                    <Text style={styles.eventTime}>
                      {new Date(event.start_time).toLocaleString()} - 
                      {new Date(event.end_time).toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteEvent(
                      event.id,
                      `${event.property?.address}${event.property?.address2 ? ` ${event.property.address2}` : ''}`
                    )}
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Active Open Houses Section */}
        {activeEvents.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>
              Active Open Houses ({activeEvents.length})
            </Text>
            {activeEvents.map((event) => (
              <View key={event.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.cardTitle}>Active Open House</Text>
                    <Text style={styles.property}>
                      {event.property?.address}
                      {event.property?.address2 ? ` ${event.property.address2}` : ''}
                    </Text>
                    <Text style={styles.eventTime}>
                      {new Date(event.start_time).toLocaleString()} - 
                      {new Date(event.end_time).toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteEvent(
                      event.id,
                      `${event.property?.address}${event.property?.address2 ? ` ${event.property.address2}` : ''}`
                    )}
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.buttonHalf}
                    onPress={() =>
                      navigation.navigate('EventDashboard', { eventId: event.id })
                    }
                  >
                    <Text style={styles.buttonText}>Manage Queue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.buttonHalf}
                    onPress={() =>
                      navigation.navigate('SelectTenants', { eventId: event.id })
                    }
                  >
                    <Text style={styles.buttonText}>Send Application</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : scheduledEvents.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No Active Events</Text>
            <Text style={styles.cardSubtext}>Create an open house to get started</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Properties')}
          >
            <Text style={styles.actionButtonText}>My Properties</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('CreateEvent', {})}
          >
            <Text style={styles.actionButtonText}>Create Open House</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 20, paddingTop: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: { fontSize: 14, color: '#64748b', fontWeight: '600', marginBottom: 8 },
  cardSubtext: { fontSize: 14, color: '#94a3b8', marginTop: 8 },
  property: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    marginLeft: 12,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonHalf: {
    flex: 1,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actions: { gap: 12, marginTop: 8 },
  actionButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: '#334155', textAlign: 'center' },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#334155', 
    marginBottom: 12 
  },
  eventTime: { 
    fontSize: 14, 
    color: '#64748b', 
    marginBottom: 12 
  },
});

export default AgentHomeScreen;
