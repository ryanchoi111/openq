import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { eventService } from '../../services/eventService';
import { OpenHouseEvent } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'AgentHome'>;

const AgentHomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user, signOut } = useAuth();
  const [activeEvent, setActiveEvent] = useState<OpenHouseEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActiveEvent();
  }, []);

  const loadActiveEvent = async () => {
    if (!user?.id) return;
    try {
      const event = await eventService.getActiveEvent(user.id);
      setActiveEvent(event);
    } catch (error) {
      console.error('Error loading active event:', error);
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Agent Dashboard</Text>
        <Text style={styles.subtitle}>Welcome, {user?.name}</Text>

        {activeEvent ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Active Open House</Text>
            <Text style={styles.property}>{activeEvent.property?.address}</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() =>
                navigation.navigate('EventDashboard', { eventId: activeEvent.id })
              }
            >
              <Text style={styles.buttonText}>Manage Queue</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No Active Event</Text>
            <Text style={styles.cardSubtext}>Create an open house to get started</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Properties')}
          >
            <Text style={styles.actionButtonText}>My Properties</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('CreateEvent', {})}
          >
            <Text style={styles.actionButtonText}>Create Open House</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 16, color: '#64748b', marginTop: 4, marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 14, color: '#64748b', fontWeight: '600', marginBottom: 8 },
  cardSubtext: { fontSize: 14, color: '#94a3b8', marginTop: 8 },
  property: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 16 },
  button: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actions: { gap: 12, marginTop: 8 },
  actionButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: '#334155', textAlign: 'center' },
  logoutButton: { marginTop: 32, padding: 16, alignItems: 'center' },
  logoutButtonText: { fontSize: 16, color: '#ef4444', fontWeight: '600' },
});

export default AgentHomeScreen;
