import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'EventHistory'>;

const EventHistoryScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [completedEvents, setCompletedEvents] = useState<OpenHouseEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompletedEvents();
  }, [user?.id]);

  const loadCompletedEvents = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const events = await eventService.getCompletedEvents(user.id);
      setCompletedEvents(events);
    } catch (error) {
      console.error('Error loading completed events:', error);
      setCompletedEvents([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const renderEvent = ({ item }: { item: OpenHouseEvent }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CompletedEventWaitlist', { eventId: item.id })}
    >
      <Text style={styles.property}>
        {item.property?.address}
        {item.property?.address2 ? ` ${item.property.address2}` : ''}
      </Text>
      <Text style={styles.details}>
        {item.property?.city}, {item.property?.state} {item.property?.zip}
      </Text>
      <Text style={styles.eventTime}>
        {new Date(item.start_time).toLocaleString()} - {new Date(item.end_time).toLocaleString()}
      </Text>
      <Text style={styles.status}>Completed</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={completedEvents}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No completed events yet</Text>
            <Text style={styles.emptySubtext}>
              Your past open houses will appear here
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  list: { padding: 20 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  property: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  details: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  eventTime: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
  },
});

export default EventHistoryScreen;

