/**
 * Completed Tours Screen
 * Shows all users who have completed their tours for an event
 */

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
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { waitlistService } from '../../services/waitlistService';
import { WaitlistEntry } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'CompletedTours'>;

const CompletedToursScreen: React.FC<Props> = ({ route }) => {
  const { eventId } = route.params;
  const [completedTours, setCompletedTours] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompletedTours();
    
    // Subscribe to realtime updates
    const subscription = waitlistService.subscribeToWaitlist(eventId, () => {
      loadCompletedTours();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [eventId]);

  const loadCompletedTours = async () => {
    try {
      const data = await waitlistService.getWaitlist(eventId);
      // Filter to show only completed tours
      const completed = data.filter((entry) => entry.status === 'completed');
      setCompletedTours(completed);
    } catch (error) {
      console.error('Error loading completed tours:', error);
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

  if (completedTours.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={64} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No Completed Tours</Text>
          <Text style={styles.emptyText}>
            Users who complete their tours will appear here
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerCount}>
          {completedTours.length} {completedTours.length === 1 ? 'tour' : 'tours'} completed
        </Text>
      </View>

      <FlatList
        data={completedTours}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardContent}>
              <Text style={styles.position}>#{item.position}</Text>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.guest_name || 'User'}</Text>
                  {item.expressed_interest && (
                    <Ionicons name="star" size={20} color="#fbbf24" style={styles.starIcon} />
                  )}
                </View>
                {item.guest_phone && (
                  <Text style={styles.detail}>{item.guest_phone}</Text>
                )}
                {item.guest_email && (
                  <Text style={styles.detail}>{item.guest_email}</Text>
                )}
                <Text style={styles.timestamp}>
                  Completed: {item.completed_at ? new Date(item.completed_at).toLocaleString() : 'N/A'}
                </Text>
              </View>
            </View>
            {item.notes && (
              <View style={styles.notesContainer}>
                <Text style={styles.notesLabel}>Notes:</Text>
                <Text style={styles.notesText}>{item.notes}</Text>
              </View>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  cardContent: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  position: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  starIcon: {
    marginLeft: 4,
  },
  detail: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  notesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#1e293b',
  },
});

export default CompletedToursScreen;

