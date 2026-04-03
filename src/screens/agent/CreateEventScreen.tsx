import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { propertyService } from '../../services/propertyService';
import { eventService } from '../../services/eventService';
import { Property } from '../../types';
import { colors, typography, spacing, radii } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'CreateEvent'>;

const CreateEventScreen: React.FC<Props> = ({ navigation, route }) => {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    route.params?.propertyId || null
  );

  // Date/Time state
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return now;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours from start
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Reload properties whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProperties();
    }, [user?.id])
  );

  const loadProperties = async () => {
    if (!user?.id) return;

    try {
      // Only load properties that don't have active or scheduled open house events
      const data = await propertyService.getAvailablePropertiesForEvent(user.id);
      setProperties(data);
    } catch (error) {
      console.error('[CreateEventScreen] Error loading properties:', error);
      Alert.alert('Error', 'Failed to load properties. Please try again.');
    }
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !user?.id) {
      Alert.alert('Required', 'Please select a property');
      return;
    }

    // Validate end time is after start time
    if (endDate <= startDate) {
      Alert.alert('Invalid Time', 'End time must be after start time');
      return;
    }

    try {
      const startTime = startDate.toISOString();
      const endTime = endDate.toISOString();
      const now = new Date();

      const event = await eventService.createEvent({
        propertyId: selectedPropertyId,
        agentId: user.id,
        startTime,
        endTime,
      });

      // Determine if scheduled or active
      if (startDate > now) {
        Alert.alert('Success', 'Open house scheduled successfully!');
        navigation.navigate('AgentTabs');
      } else {
        Alert.alert('Success', 'Open house created and is now active!');
        // Reset navigation stack so back button goes to AgentHome
        navigation.reset({
          index: 1,
          routes: [
            { name: 'AgentTabs' },
            { name: 'EventDashboard', params: { eventId: event.id } },
          ],
        });
      }
    } catch (error: any) {
      console.error('[CreateEventScreen] Error:', error);
      Alert.alert('Error', 'Failed to create open house. Please try again.');
    }
  };

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
      // If end date would be before new start date, adjust it to 1 hour after start
      if (endDate <= selectedDate) {
        setEndDate(new Date(selectedDate.getTime() + 60 * 60 * 1000));
      }
    }
  };

  const onStartTimeChange = (event: any, selectedDate?: Date) => {
    setShowStartTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
      // If end date would be before new start date, adjust it to 1 hour after start
      if (endDate <= selectedDate) {
        setEndDate(new Date(selectedDate.getTime() + 60 * 60 * 1000));
      }
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const onEndTimeChange = (event: any, selectedDate?: Date) => {
    setShowEndTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
      >
        {properties.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={48} color={colors.ink200} />
            <Text style={styles.emptyStateTitle}>No Available Properties</Text>
            <Text style={styles.emptyStateText}>
              All your properties currently have active or scheduled open house events.
            </Text>
            <Text style={styles.emptyStateText}>
              Complete or cancel existing events to create new ones.
            </Text>
          </View>
        ) : (
          properties.map((property) => (
          <TouchableOpacity
            key={property.id}
            style={[
              styles.propertyCard,
              selectedPropertyId === property.id && styles.propertyCardSelected,
            ]}
            onPress={() => setSelectedPropertyId(property.id)}
          >
            <Text style={styles.address}>
              {property.address}
              {property.address2 ? ` ${property.address2}` : ''}
            </Text>
            <Text style={styles.details}>
              {property.bedrooms}bd • {property.bathrooms}ba • ${property.rent}/mo
            </Text>
          </TouchableOpacity>
        )))}

        {/* Date/Time Selection Section */}
        <View style={styles.dateTimeSection}>
          <Text style={styles.sectionTitle}>Schedule</Text>

          {/* Start Date/Time */}
          <View style={styles.dateTimeRow}>
            <Text style={styles.label}>START</Text>
            <View style={styles.dateTimeButtons}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {startDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowStartTimePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {startDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* End Date/Time */}
          <View style={styles.dateTimeRow}>
            <Text style={styles.label}>END</Text>
            <View style={styles.dateTimeButtons}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {endDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowEndTimePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {endDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Date/Time Pickers */}
        {showStartDatePicker && (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={onStartDateChange}
            minimumDate={new Date()}
          />
        )}
        {showStartTimePicker && (
          <DateTimePicker
            value={startDate}
            mode="time"
            display="default"
            onChange={onStartTimeChange}
          />
        )}
        {showEndDatePicker && (
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            onChange={onEndDateChange}
            minimumDate={startDate}
          />
        )}
        {showEndTimePicker && (
          <DateTimePicker
            value={endDate}
            mode="time"
            display="default"
            onChange={onEndTimeChange}
          />
        )}

        <TouchableOpacity
          style={[styles.button, !selectedPropertyId && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!selectedPropertyId}
        >
          <Text style={styles.buttonText}>
            {endDate <= startDate ? 'Schedule Open House' : 'Create & Start Now'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.xl },
  scrollContent: { paddingBottom: 40 },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyStateTitle: {
    ...typography.heading,
    color: colors.ink900,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    ...typography.caption,
    color: colors.ink400,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  propertyCard: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  propertyCardSelected: {
    borderColor: colors.navy400,
    borderWidth: 1.5,
    backgroundColor: colors.navy50,
  },
  address: {
    ...typography.subheading,
    color: colors.ink900,
  },
  details: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: spacing.xs,
  },
  dateTimeSection: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink900,
    marginBottom: spacing.lg,
  },
  dateTimeRow: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.small,
    color: colors.ink600,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  dateTimeButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateTimeButton: {
    flex: 1,
    backgroundColor: colors.navy50,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  dateTimeText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink900,
  },
  button: {
    backgroundColor: colors.navy900,
    borderRadius: radii.md,
    marginTop: spacing.xl,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: colors.white,
    ...typography.subheading,
    textAlign: 'center',
  },
});

export default CreateEventScreen;
