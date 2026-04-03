import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';
import { colors, typography, spacing, radii } from '../../utils/theme';

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
        <ActivityIndicator size="large" color={colors.navy900} />
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
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>Ended</Text>
      </View>
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
  container: { flex: 1, backgroundColor: colors.white },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  list: { padding: spacing.xl },
  card: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  property: {
    ...typography.subheading,
    color: colors.ink900,
    marginBottom: spacing.xs,
  },
  details: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.sm,
  },
  eventTime: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.ink50,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.ink400,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...typography.heading,
    color: colors.ink900,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.ink400,
  },
});

export default EventHistoryScreen;
