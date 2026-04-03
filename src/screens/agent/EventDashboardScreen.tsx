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
import { AgentStackParamList } from '../../navigation/types';
import { waitlistService } from '../../services/waitlistService';
import { eventService } from '../../services/eventService';
import { WaitlistEntry, OpenHouseEvent } from '../../types';
import {
  colors,
  typography,
  spacing,
  radii,
  badgeStyles,
  getAvatarColor,
  getInitials,
} from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'EventDashboard'>;

const EventDashboardScreen: React.FC<Props> = ({ route, navigation }) => {
  const { eventId } = route.params;
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [event, setEvent] = useState<OpenHouseEvent | null>(null);

  useEffect(() => {
    loadEvent();
    loadWaitlist();
    const subscription = waitlistService.subscribeToWaitlist(eventId, () => {
      loadWaitlist();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadEvent = async () => {
    try {
      const data = await eventService.getEvent(eventId);
      setEvent(data);
    } catch (error) {
      console.error('[EventDashboard] Failed to load event:', error);
    }
  };

  const loadWaitlist = async () => {
    try {
      const data = await waitlistService.getWaitlist(eventId);
      const activeQueue = data.filter((entry) => entry.status !== 'completed');
      setWaitlist(activeQueue);
    } catch (error) {
      console.error('[EventDashboard] Failed to load waitlist:', error);
      Alert.alert('Error', 'Failed to load waitlist. Pull down to retry.');
    }
  };

  const handleCallNext = async () => {
    const nextPerson = waitlist.find((e) => e.status === 'waiting');
    if (!nextPerson) {
      Alert.alert('Queue Empty', 'No one waiting');
      return;
    }

    try {
      await waitlistService.updateEntryStatus(nextPerson.id, 'touring');
    } catch {
      Alert.alert('Error', 'Failed to call next');
    }
  };

  const handleComplete = async (entryId: string) => {
    try {
      await waitlistService.updateEntryStatus(entryId, 'completed');
    } catch {
      Alert.alert('Error', 'Failed to complete tour');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const getDisplayName = (item: WaitlistEntry): string => {
    return item.guest_name || item.user?.name || `Guest #${item.position}`;
  };

  const getStatusLabel = (item: WaitlistEntry): string => {
    if (item.expressed_interest) return 'Apply';
    if (item.status === 'waiting') return 'Browsing';
    if (item.status === 'touring') return 'Live now';
    return item.status;
  };

  const getStatusBadgeStyle = (item: WaitlistEntry) => {
    if (item.expressed_interest) return badgeStyles['wants-to-apply'];
    if (item.status === 'waiting') return badgeStyles['waiting'];
    if (item.status === 'touring') return badgeStyles['touring'];
    return { bg: colors.ink50, text: colors.ink400 };
  };

  const renderAttendeeRow = ({ item, index }: { item: WaitlistEntry; index: number }) => {
    const name = getDisplayName(item);
    const email = item.guest_email || item.user?.email;
    const avatarColor = getAvatarColor(name);
    const initials = getInitials(name);
    const badge = getStatusBadgeStyle(item);
    const label = getStatusLabel(item);
    const isLast = index === waitlist.length - 1;

    return (
      <View style={[styles.attendeeRow, !isLast && styles.attendeeRowBorder]}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.attendeeInfo}>
          <Text style={styles.attendeeName}>{name}</Text>
          {email ? (
            <Text style={styles.attendeeCaption}>{email}</Text>
          ) : (
            <Text style={styles.attendeeCaption}>#{item.position}</Text>
          )}
        </View>

        <View style={styles.attendeeRight}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{label}</Text>
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
      </View>
    );
  };

  const propertyAddress = event?.property?.address ?? 'Loading...';
  const timeRange =
    event?.start_time && event?.end_time
      ? `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`
      : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header info */}
      <View style={styles.headerInfo}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressHeading}>{propertyAddress}</Text>
            {timeRange ? <Text style={styles.timeCaption}>{timeRange}</Text> : null}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>Live now</Text>
            </View>
            <Text style={styles.capacityText}>{waitlist.length} attendees</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.qrButton}
          onPress={() => {
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
          <Text style={styles.completedToursButtonText}>View Completed Tours</Text>
        </TouchableOpacity>
      </View>

      {/* Attendee list */}
      <View style={styles.listWrapper}>
        <Text style={styles.sectionHeader}>Attendees ({waitlist.length})</Text>
        <View style={styles.listCard}>
          <FlatList
            data={waitlist}
            keyExtractor={(item) => item.id}
            renderItem={renderAttendeeRow}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },

  // Header info
  headerInfo: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  addressHeading: {
    ...typography.heading,
    color: colors.ink900,
  },
  timeCaption: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: spacing.xs,
  },
  headerRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  liveBadge: {
    backgroundColor: colors.green50,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  liveBadgeText: {
    ...typography.label,
    color: colors.greenDark,
  },
  capacityText: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: spacing.xs,
  },
  headerDivider: {
    height: 0.5,
    backgroundColor: colors.ink200,
    marginTop: spacing.lg,
  },

  // Button row
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  qrButton: {
    flex: 1,
    backgroundColor: colors.white,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  qrButtonText: {
    ...typography.subheading,
    color: colors.ink900,
  },
  callButton: {
    flex: 1,
    backgroundColor: colors.navy900,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
  },
  callButtonText: {
    ...typography.subheading,
    color: colors.white,
  },

  // Completed tours ghost button
  completedToursButtonContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  completedToursButton: {
    backgroundColor: colors.navy50,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
  },
  completedToursButtonText: {
    ...typography.subheading,
    color: colors.navy900,
  },

  // Attendee list
  listWrapper: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  sectionHeader: {
    ...typography.subheading,
    color: colors.ink900,
    marginBottom: spacing.md,
  },
  listCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  listContent: {
    flexGrow: 1,
  },

  // Attendee row
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: spacing.lg,
  },
  attendeeRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ink200,
  },

  // Avatar
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },

  // Attendee info
  attendeeInfo: {
    flex: 1,
  },
  attendeeName: {
    ...typography.subheading,
    color: colors.ink900,
  },
  attendeeCaption: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },

  // Right side badges/buttons
  attendeeRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    ...typography.label,
  },

  // Complete CTA
  completeButton: {
    backgroundColor: colors.coral500,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  completeButtonText: {
    ...typography.label,
    color: colors.white,
  },
});

export default EventDashboardScreen;
