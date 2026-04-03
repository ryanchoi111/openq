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
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';
import { colors, typography, spacing, radii, badgeStyles } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'AgentHome'>;

/** Format today's date as "Today, March 13" */
function formatTodayDate(): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const day = now.getDate();
  return `Today, ${month} ${day}`;
}

/** Format event time range as compact string */
function formatTimeRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Build property details line: beds/bath + price */
function formatPropertyDetails(event: OpenHouseEvent): string {
  const p = event.property;
  if (!p) return '';
  const parts: string[] = [];
  if (p.bedrooms) parts.push(`${p.bedrooms} bed`);
  if (p.bathrooms) parts.push(`${p.bathrooms} bath`);
  if (p.rent) parts.push(`$${p.rent.toLocaleString()}/mo`);
  return parts.join(' · ');
}

const AgentHomeScreen: React.FC<Props> = ({ navigation }) => {
  const parentNav = useNavigation<NativeStackNavigationProp<AgentStackParamList>>();
  const { user } = useAuth();
  const [scheduledEvents, setScheduledEvents] = useState<OpenHouseEvent[]>([]);
  const [activeEvents, setActiveEvents] = useState<OpenHouseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fabScale = React.useRef(new Animated.Value(1)).current;

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
              loadAllEvents();
            } catch (error: any) {
              console.error('Error deleting event:', error);
              Alert.alert('Error', 'Failed to delete open house. Please try again.');
            }
          },
        },
      ]
    );
  };

  const allEvents = [...activeEvents, ...scheduledEvents];

  // ---------- FAB press handlers ----------
  const onFabPressIn = () => {
    Animated.spring(fabScale, {
      toValue: 0.93,
      useNativeDriver: true,
    }).start();
  };
  const onFabPressOut = () => {
    Animated.spring(fabScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  // ---------- Loading state ----------
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.navy700} />
      </View>
    );
  }

  // ---------- Empty state ----------
  if (allEvents.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={colors.ink200} />
          <Text style={styles.emptyHeading}>No tours scheduled</Text>
          <Text style={styles.emptyBody}>
            Create your first open house tour to get started
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() => parentNav.navigate('CreateEvent', {})}
          >
            <Text style={styles.primaryButtonText}>Create Tour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Main dashboard ----------
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Date subheading */}
        <Text style={styles.dateLabel}>{formatTodayDate()}</Text>

        {/* Metric cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.metricsRow}
          contentContainerStyle={styles.metricsContent}
        >
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Scheduled</Text>
            <Text style={styles.metricValue}>{allEvents.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Attendees</Text>
            <Text style={styles.metricValue}>0</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Want to apply</Text>
            <Text style={[styles.metricValue, { color: colors.green500 }]}>0</Text>
          </View>
        </ScrollView>

        {/* Tour cards */}
        {allEvents.map((event) => {
          const isActive = event.status === 'active';
          const address = `${event.property?.address ?? ''}${event.property?.address2 ? ` ${event.property.address2}` : ''}`;
          const badge = isActive ? badgeStyles['live-now'] : badgeStyles['upcoming'];
          const badgeLabel = isActive ? 'Live now' : 'Upcoming';

          return (
            <Pressable
              key={event.id}
              style={({ pressed }) => [
                styles.tourCard,
                pressed && { backgroundColor: colors.ink50 },
              ]}
              onPress={() =>
                parentNav.navigate('EventDashboard', { eventId: event.id })
              }
            >
              {/* Top row: address + badge */}
              <View style={styles.tourTopRow}>
                <Text style={styles.tourAddress} numberOfLines={1}>
                  {address}
                </Text>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>
                    {badgeLabel}
                  </Text>
                </View>
              </View>

              {/* Details row */}
              <Text style={styles.tourDetails}>
                {formatTimeRange(event.start_time, event.end_time)}
                {event.property ? `  ·  ${formatPropertyDetails(event)}` : ''}
              </Text>

              {/* Bottom row: joined / apply + delete */}
              <View style={styles.tourBottomRow}>
                <Text style={styles.tourMeta}>
                  0 joined  ·  <Text style={{ color: colors.green500 }}>0 want to apply</Text>
                </Text>
                <TouchableOpacity
                  style={styles.deleteButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => handleDeleteEvent(event.id, address)}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.coral500} />
                </TouchableOpacity>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* FAB */}
      <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={onFabPressIn}
          onPressOut={onFabPressOut}
          onPress={() => parentNav.navigate('CreateEvent', {})}
          style={styles.fabTouchable}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 100, // room for FAB
  },

  // Date
  dateLabel: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.md,
  },

  // Metric cards row
  metricsRow: {
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.xl, // bleed to screen edge
  },
  metricsContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  metricCard: {
    width: 120,
    backgroundColor: colors.ink50,
    borderRadius: radii.lg,
    padding: 14,
  },
  metricLabel: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.xs,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.ink900,
  },

  // Tour card
  tourCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tourTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  tourAddress: {
    ...typography.subheading,
    color: colors.ink900,
    flex: 1,
    marginRight: spacing.sm,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tourDetails: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.sm,
  },
  tourBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tourMeta: {
    ...typography.caption,
    color: colors.ink600,
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.coral500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  fabTouchable: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  emptyHeading: {
    ...typography.heading,
    color: colors.ink900,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.ink400,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  primaryButton: {
    backgroundColor: colors.navy900,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.subheading,
    color: colors.white,
  },
});

export default AgentHomeScreen;
