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
import { TenantStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { waitlistService } from '../../services/waitlistService';
import { WaitlistEntry } from '../../types';

type Props = NativeStackScreenProps<TenantStackParamList, 'TenantHistory'>;

// Extended type to include event details
interface WaitlistEntryWithEvent extends WaitlistEntry {
  event?: {
    property?: {
      address: string;
      address2?: string;
      city: string;
      state: string;
      zip: string;
    };
    start_time: string;
    end_time: string;
    status: string;
  };
}

const TenantHistoryScreen: React.FC<Props> = () => {
  const { user, isGuest } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntryWithEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  const loadHistory = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const userEntries = await waitlistService.getUserWaitlistHistory(user.id, isGuest);
      setEntries(userEntries);
    } catch (error) {
      console.error('Error loading tenant history:', error);
      setEntries([]);
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

  const getEventStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'active':
        return '#3b82f6';
      case 'scheduled':
        return '#f59e0b';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const renderEntry = ({ item }: { item: WaitlistEntryWithEvent }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.property}>
          {item.event?.property?.address || 'Unknown Property'}
          {item.event?.property?.address2 ? ` ${item.event.property.address2}` : ''}
        </Text>
        {item.event?.status && (
          <View
            style={[
              styles.eventStatusBadge,
              { backgroundColor: getEventStatusColor(item.event.status) },
            ]}
          >
            <Text style={styles.eventStatusText}>
              {item.event.status.charAt(0).toUpperCase() + item.event.status.slice(1)}
            </Text>
          </View>
        )}
      </View>

      {item.event?.property && (
        <Text style={styles.location}>
          {item.event.property.city}, {item.event.property.state} {item.event.property.zip}
        </Text>
      )}

      {item.event && (
        <Text style={styles.eventTime}>
          {new Date(item.event.start_time).toLocaleString()} -{' '}
          {new Date(item.event.end_time).toLocaleString()}
        </Text>
      )}

      <View style={styles.entryDetails}>
        <View style={styles.positionRow}>
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>#{item.position}</Text>
          </View>
          <Text style={styles.positionLabel}>Your position in queue</Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <View
            style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
          >
            <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.timestampSection}>
        <Text style={styles.timestampText}>
          Joined: {new Date(item.joined_at).toLocaleString()}
        </Text>
        {item.started_tour_at && (
          <Text style={styles.timestampText}>
            Tour started: {new Date(item.started_tour_at).toLocaleString()}
          </Text>
        )}
        {item.completed_at && (
          <Text style={styles.timestampText}>
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
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No history yet</Text>
            <Text style={styles.emptySubtext}>
              Scan a QR code to join an open house waitlist
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
    marginBottom: 16,
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
    marginBottom: 4,
  },
  property: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginRight: 12,
  },
  eventStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  location: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  eventTime: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  entryDetails: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
    marginBottom: 12,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  positionLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
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
  timestampSection: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  timestampText: {
    fontSize: 12,
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
    textAlign: 'center',
  },
});

export default TenantHistoryScreen;

