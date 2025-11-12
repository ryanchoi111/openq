import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { eventService } from '../../services/eventService';
import { waitlistService } from '../../services/waitlistService';
import { OpenHouseEvent, WaitlistEntry } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'CompletedEventWaitlist'>;

const CompletedEventWaitlistScreen: React.FC<Props> = ({ route }) => {
  const { eventId } = route.params;
  const [event, setEvent] = useState<OpenHouseEvent | null>(null);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEventAndWaitlist();
  }, [eventId]);

  const loadEventAndWaitlist = async () => {
    try {
      setLoading(true);
      const [eventData, waitlistData] = await Promise.all([
        eventService.getEvent(eventId),
        waitlistService.getWaitlist(eventId),
      ]);
      setEvent(eventData);
      setWaitlistEntries(waitlistData);
    } catch (error) {
      console.error('Error loading event and waitlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'touring':
        return '#3b82f6';
      case 'waiting':
        return '#f59e0b';
      case 'skipped':
        return '#6b7280';
      case 'no-show':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  const renderWaitlistEntry = ({ item }: { item: WaitlistEntry }) => (
    <View style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <View style={styles.positionBadge}>
          <Text style={styles.positionText}>#{item.position}</Text>
        </View>
        <View style={styles.entryInfo}>
          <Text style={styles.entryName}>
            {item.guest_name || item.user_id || 'Unknown'}
          </Text>
          {item.guest_phone && (
            <Text style={styles.entryPhone}>{item.guest_phone}</Text>
          )}
          {item.guest_email && (
            <Text style={styles.entryPhone}>{item.guest_email}</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.entryDetails}>
        <Text style={styles.entryDetailText}>
          Joined: {new Date(item.joined_at).toLocaleString()}
        </Text>
        {item.started_tour_at && (
          <Text style={styles.entryDetailText}>
            Tour started: {new Date(item.started_tour_at).toLocaleString()}
          </Text>
        )}
        {item.completed_at && (
          <Text style={styles.entryDetailText}>
            Completed: {new Date(item.completed_at).toLocaleString()}
          </Text>
        )}
      </View>

      {(item.expressed_interest || item.application_sent) && (
        <View style={styles.engagementRow}>
          {item.expressed_interest && (
            <View style={styles.engagementBadge}>
              <Text style={styles.engagementText}>💚 Interested</Text>
            </View>
          )}
          {item.application_sent && (
            <View style={styles.engagementBadge}>
              <Text style={styles.engagementText}>📝 Applied</Text>
            </View>
          )}
        </View>
      )}

      {item.notes && (
        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes:</Text>
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.property}>
          {event.property?.address}
          {event.property?.address2 ? ` ${event.property.address2}` : ''}
        </Text>
        <Text style={styles.details}>
          {event.property?.city}, {event.property?.state} {event.property?.zip}
        </Text>
        <Text style={styles.eventTime}>
          {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
        </Text>
        <Text style={styles.totalGuests}>
          {waitlistEntries.length} {waitlistEntries.length === 1 ? 'guest' : 'guests'} joined
        </Text>
      </View>

      <FlatList
        data={waitlistEntries}
        keyExtractor={(item) => item.id}
        renderItem={renderWaitlistEntry}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No guests joined the waitlist</Text>
            <Text style={styles.emptySubtext}>
              This open house had no visitors
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
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  property: {
    fontSize: 18,
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
    marginBottom: 8,
  },
  totalGuests: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  list: { padding: 20 },
  entryCard: {
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
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  positionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  entryPhone: {
    fontSize: 14,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  entryDetails: {
    marginBottom: 8,
  },
  entryDetailText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 2,
  },
  engagementRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  engagementBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  engagementText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  notesSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
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

export default CompletedEventWaitlistScreen;

