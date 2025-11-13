import React, { useState, useEffect } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { propertyService } from '../../services/propertyService';
import { eventService } from '../../services/eventService';
import { Property } from '../../types';

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

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    if (!user?.id) return;
    // Only load properties that don't have active or scheduled open house events
    const data = await propertyService.getAvailablePropertiesForEvent(user.id);
    setProperties(data);
    
    if (data.length === 0) {
      Alert.alert(
        'No Available Properties',
        'All your properties already have active or scheduled open house events. Complete or cancel existing events first.'
      );
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
        navigation.navigate('AgentHome');
      } else {
        Alert.alert('Success', 'Open house created and is now active!');
        // Reset navigation stack so back button goes to AgentHome
        navigation.reset({
          index: 1,
          routes: [
            { name: 'AgentHome' },
            { name: 'EventDashboard', params: { eventId: event.id } },
          ],
        });
      }
    } catch (error: any) {
      console.error('[CreateEventScreen] Error:', error);
      Alert.alert('Error', error.message || 'Failed to create open house');
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
            <Text style={styles.label}>Start</Text>
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
            <Text style={styles.label}>End</Text>
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  scrollContent: { paddingBottom: 40 },
  emptyState: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    marginVertical: 20,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  propertyCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  propertyCardSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  address: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  details: { fontSize: 14, color: '#64748b', marginTop: 4 },
  dateTimeSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  dateTimeRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  dateTimeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  dateTimeText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

export default CreateEventScreen;
