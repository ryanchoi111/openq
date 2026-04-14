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
import { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { getCalendarEvents } from '../../services/calendarService';
import { connectGmailAccount, getGmailConnectionStatus } from '../../services/gmailService';
import { OpenHouseEvent, CalendarEvent } from '../../types';
import { colors, typography, spacing, radii, badgeStyles } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'AgentHome'>;

/** Format event time range as compact string */
function formatTimeRange(start: string, end: string): string {
  // All-day events have date-only strings (no 'T')
  if (!start.includes('T')) return 'All day';
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

/** Get current week dates (Monday–Sunday) */
function getWeekDates(): { dayLabel: string; dateNum: number; isoDate: string; isToday: boolean }[] {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  // Monday offset: if Sunday (0), go back 6 days; otherwise go back (day - 1)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isoDate = d.toISOString().split('T')[0];
    return {
      dayLabel: label,
      dateNum: d.getDate(),
      isoDate,
      isToday: isoDate === todayStr,
    };
  });
}

const AgentHomeScreen: React.FC<Props> = () => {
  const parentNav = useNavigation<NativeStackNavigationProp<AgentStackParamList>>();
  const { user } = useAuth();
  const [scheduledEvents, setScheduledEvents] = useState<OpenHouseEvent[]>([]);
  const [activeEvents, setActiveEvents] = useState<OpenHouseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fabScale = React.useRef(new Animated.Value(1)).current;

  // Calendar state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [needsCalendarReauth, setNeedsCalendarReauth] = useState(false);
  const [hasGmailConnection, setHasGmailConnection] = useState<boolean | null>(null);

  const weekDates = getWeekDates();
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Reload when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
      checkGmailAndLoadCalendar(selectedDate);
    }, [user?.id])
  );

  // Reload calendar when date changes
  useEffect(() => {
    if (hasGmailConnection && user?.id) {
      loadCalendarEvents(selectedDate);
    }
  }, [selectedDate]);

  const checkGmailAndLoadCalendar = async (date: string) => {
    if (!user?.id) return;
    const status = await getGmailConnectionStatus(user.id);
    setHasGmailConnection(!!status);
    if (status && !status.needsReauth) {
      loadCalendarEvents(date);
    } else if (status?.needsReauth) {
      setNeedsCalendarReauth(true);
    }
  };

  const loadCalendarEvents = async (date: string) => {
    if (!user?.id) return;
    setCalendarLoading(true);
    setNeedsCalendarReauth(false);
    const result = await getCalendarEvents(user.id, date, deviceTimezone);
    setCalendarEvents(result.events);
    if (result.needsReauth) setNeedsCalendarReauth(true);
    setCalendarLoading(false);
  };

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
    setRefreshing(true);
    try {
      const [eventsResult] = await Promise.all([
        eventService.getEventsByAgent(user.id),
        loadCalendarEvents(selectedDate),
      ]);
      setScheduledEvents(eventsResult.scheduled);
      setActiveEvents(eventsResult.active);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, propertyAddress?: string) => {
    Alert.alert(
      'Delete Open House',
      `Are you sure you want to delete this open house${propertyAddress ? ` at ${propertyAddress}` : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
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

  const handleConnectCalendar = async () => {
    if (!user?.id) return;
    const result = await connectGmailAccount(user.id);
    if (result.success) {
      setHasGmailConnection(true);
      loadCalendarEvents(selectedDate);
    } else {
      Alert.alert('Error', result.error || 'Failed to connect Google Calendar');
    }
  };

  const renderCalendarSection = () => {
    if (hasGmailConnection === false) {
      return (
        <TouchableOpacity style={styles.connectBanner} onPress={handleConnectCalendar}>
          <Ionicons name="calendar-outline" size={22} color={colors.navy700} />
          <View style={styles.connectBannerInfo}>
            <Text style={styles.connectBannerTitle}>Connect Google Calendar</Text>
            <Text style={styles.connectBannerSubtitle}>See your scheduled tours here</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
        </TouchableOpacity>
      );
    }

    if (needsCalendarReauth) {
      return (
        <TouchableOpacity style={styles.reauthBanner} onPress={handleConnectCalendar}>
          <Ionicons name="refresh-outline" size={20} color={colors.navy700} />
          <Text style={styles.reauthText}>Reconnect Google Calendar</Text>
        </TouchableOpacity>
      );
    }

    if (calendarLoading) {
      return <ActivityIndicator size="small" color={colors.navy700} style={styles.calendarLoader} />;
    }

    if (calendarEvents.length === 0) {
      return <Text style={styles.emptyDayText}>No bookings for this day</Text>;
    }

    return (
      <>
        {calendarEvents.map((event) => (
          <View key={event.id} style={styles.calendarCard}>
            <Text style={styles.calendarTime}>
              {formatTimeRange(event.start, event.end)}
            </Text>
            <Text style={styles.calendarTitle}>{event.summary}</Text>
            {event.attendees && event.attendees.length > 0 && (
              <View style={styles.calendarAttendeesRow}>
                <Ionicons name="people-outline" size={14} color={colors.ink600} />
                <Text style={styles.calendarAttendees}>
                  {event.attendees.map((a) => a.displayName || a.email).join(', ')}
                </Text>
              </View>
            )}
            {event.location && (
              <View style={styles.calendarLocationRow}>
                <Ionicons name="location-outline" size={14} color={colors.ink400} />
                <Text style={styles.calendarLocation}>{event.location}</Text>
              </View>
            )}
          </View>
        ))}
      </>
    );
  };

  const allEvents = [...activeEvents, ...scheduledEvents];

  // FAB press handlers
  const onFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.93, useNativeDriver: true }).start();
  };
  const onFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }).start();
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.navy700} />
      </View>
    );
  }

  const firstName = user?.name?.split(' ')[0] || 'there';

  // ---------- Main layout ----------
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Greeting */}
        <Text style={styles.greeting}>Hi, {firstName}</Text>

        {/* Section: Scheduled Tour Bookings */}
        <Text style={styles.sectionHeader}>Scheduled Tour Bookings</Text>
        <View style={styles.sectionDivider} />

        {/* Date strip */}
        <View style={styles.dateStripContainer}>
          {weekDates.map((d) => {
            const isSelected = d.isoDate === selectedDate;
            return (
              <TouchableOpacity
                key={d.isoDate}
                style={[styles.dateCell, isSelected && styles.dateCellSelected]}
                onPress={() => setSelectedDate(d.isoDate)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateDayLabel, isSelected && styles.dateDayLabelSelected]}>
                  {d.dayLabel}
                </Text>
                <Text style={[styles.dateNumber, isSelected && styles.dateNumberSelected]}>
                  {d.dateNum}
                </Text>
                {d.isToday && !isSelected && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Calendar content */}
        {renderCalendarSection()}

        {/* Section: Active Open Houses */}
        <Text style={styles.sectionHeader}>Active Open Houses</Text>
        <View style={styles.sectionDivider} />

        {allEvents.length === 0 ? (
          <View style={styles.emptyOpenHouses}>
            <Ionicons name="calendar-outline" size={36} color={colors.ink200} />
            <Text style={styles.emptyOpenHousesText}>No active open houses</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={() => parentNav.navigate('CreateEvent', {})}
            >
              <Text style={styles.primaryButtonText}>Create Tour</Text>
            </TouchableOpacity>
          </View>
        ) : (
          allEvents.map((event) => {
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
          })
        )}
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
    paddingTop: spacing.lg,
    paddingBottom: 100,
  },

  // Greeting
  greeting: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.ink900,
    marginBottom: spacing['2xl'],
  },

  // Section headers
  sectionHeader: {
    ...typography.subheading,
    color: colors.ink900,
    marginBottom: spacing.sm,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.ink200,
    marginBottom: spacing.lg,
  },

  // Date strip
  dateStripContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.lg,
  },
  dateCell: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    minWidth: 40,
  },
  dateCellSelected: {
    backgroundColor: colors.navy900,
  },
  dateDayLabel: {
    ...typography.label,
    color: colors.ink400,
    marginBottom: spacing.xs,
  },
  dateDayLabelSelected: {
    color: colors.white,
  },
  dateNumber: {
    ...typography.subheading,
    color: colors.ink900,
  },
  dateNumberSelected: {
    color: colors.white,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.coral500,
    marginTop: spacing.xs,
  },

  // Calendar cards
  calendarCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  calendarTime: {
    ...typography.caption,
    color: colors.navy700,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  calendarTitle: {
    ...typography.subheading,
    color: colors.ink900,
    marginBottom: spacing.xs,
  },
  calendarAttendeesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  calendarAttendees: {
    ...typography.caption,
    color: colors.ink600,
    flex: 1,
  },
  calendarLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  calendarLocation: {
    ...typography.caption,
    color: colors.ink400,
    flex: 1,
  },
  calendarLoader: {
    paddingVertical: spacing['2xl'],
  },
  emptyDayText: {
    ...typography.body,
    color: colors.ink400,
    textAlign: 'center',
    paddingVertical: spacing['2xl'],
  },

  // Connect / reauth banners
  connectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy50,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  connectBannerInfo: {
    flex: 1,
  },
  connectBannerTitle: {
    ...typography.subheading,
    color: colors.ink900,
  },
  connectBannerSubtitle: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  reauthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy50,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  reauthText: {
    ...typography.caption,
    color: colors.navy700,
    fontWeight: '600',
  },

  // Open houses empty
  emptyOpenHouses: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  emptyOpenHousesText: {
    ...typography.body,
    color: colors.ink400,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
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
});

export default AgentHomeScreen;
