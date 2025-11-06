import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    if (!user?.id) return;
    const data = await propertyService.getAgentProperties(user.id);
    setProperties(data);
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !user?.id) {
      Alert.alert('Required', 'Please select a property');
      return;
    }

    try {
      // Create event starting now, ending in 2 hours (simple default)
      const startTime = new Date().toISOString();
      const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const event = await eventService.createEvent({
        propertyId: selectedPropertyId,
        agentId: user.id,
        startTime,
        endTime,
      });

      // Set event as active
      await eventService.updateEventStatus(event.id, 'active');

      Alert.alert('Success', 'Open house created');
      navigation.navigate('EventDashboard', { eventId: event.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create open house');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Create Open House</Text>
        <Text style={styles.subtitle}>Select a property</Text>

        {properties.map((property) => (
          <TouchableOpacity
            key={property.id}
            style={[
              styles.propertyCard,
              selectedPropertyId === property.id && styles.propertyCardSelected,
            ]}
            onPress={() => setSelectedPropertyId(property.id)}
          >
            <Text style={styles.address}>{property.address}</Text>
            <Text style={styles.details}>
              {property.bedrooms}bd • {property.bathrooms}ba • ${property.rent}/mo
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.button, !selectedPropertyId && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!selectedPropertyId}
        >
          <Text style={styles.buttonText}>Create & Start</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 20 },
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
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

export default CreateEventScreen;
