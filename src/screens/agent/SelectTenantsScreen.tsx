import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { waitlistService } from '../../services/waitlistService';
import { applicationService } from '../../services/applicationService';
import { WaitlistEntry } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'SelectTenants'>;

const SelectTenantsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { eventId } = route.params;
  const { user } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadWaitlistEntries();
  }, [eventId]);

  const loadWaitlistEntries = async () => {
    try {
      setLoading(true);
      const data = await waitlistService.getWaitlist(eventId);
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading waitlist entries:', error);
      // Only show alert for actual errors, not empty waitlists
      if (error instanceof Error && !error.message.includes('No rows')) {
        Alert.alert('Error', 'Failed to load waitlist entries');
      }
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (entryId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(entryId)) {
      newSelected.delete(entryId);
    } else {
      newSelected.add(entryId);
    }
    setSelectedIds(newSelected);
  };

  const handleSendApplication = async () => {
    // Check if user is an agent with housing application
    if (!user || user.role === 'guest' || !('housing_application_url' in user) || !user.housing_application_url) {
      Alert.alert(
        'No Application Uploaded',
        'Please upload a housing application in your profile first.',
        [
          {
            text: 'Go to Profile',
            onPress: () => navigation.navigate('Profile'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    if (selectedIds.size === 0) {
      Alert.alert('No Recipients Selected', 'Please select at least one tenant to send the application to.');
      return;
    }

    // Filter entries to get only selected ones with valid emails
    const selectedEntries = entries.filter(entry => selectedIds.has(entry.id));
    const entriesWithEmails = selectedEntries.filter(entry => {
      // For authenticated users, we need their email from the user profile
      // For guests, we need guest_email
      return entry.user_id || entry.guest_email;
    });

    if (entriesWithEmails.length === 0) {
      Alert.alert(
        'No Valid Email Addresses',
        'None of the selected tenants have email addresses. Please select tenants with email addresses.'
      );
      return;
    }

    Alert.alert(
      'Send Housing Application',
      `Send application to ${entriesWithEmails.length} recipient(s)?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Send',
          onPress: async () => {
            try {
              setSending(true);
              // We already validated user has housing_application_url above
              const applicationUrl = user.role !== 'guest' && 'housing_application_url' in user 
                ? user.housing_application_url 
                : '';
              
              if (!applicationUrl) {
                throw new Error('No housing application found');
              }

              await applicationService.sendApplicationToTenants(
                eventId,
                Array.from(selectedIds),
                applicationUrl
              );
              Alert.alert(
                'Success',
                `Housing application sent to ${entriesWithEmails.length} recipient(s)!`,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
              );
            } catch (error: any) {
              console.error('Error sending application:', error);
              Alert.alert('Error', error.message || 'Failed to send application');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Select Recipients</Text>
        <Text style={styles.subtitle}>
          Choose tenants to send the housing application to
        </Text>

        {entries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tenants in waitlist</Text>
          </View>
        ) : (
          entries.map((entry, index) => {
            const isSelected = selectedIds.has(entry.id);
            const hasEmail = entry.user_id || entry.guest_email;

            return (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                  !hasEmail && styles.cardDisabled,
                ]}
                onPress={() => hasEmail && toggleSelection(entry.id)}
                disabled={!hasEmail}
              >
                <View style={styles.cardContent}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.positionBadge}>#{entry.position}</Text>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>
                        {entry.guest_name || entry.user_id || 'Unknown'}
                      </Text>
                      {entry.guest_phone && (
                        <Text style={styles.cardDetail}>{entry.guest_phone}</Text>
                      )}
                      {entry.guest_email && (
                        <Text style={styles.cardDetail}>{entry.guest_email}</Text>
                      )}
                      {!hasEmail && (
                        <Text style={styles.noEmailText}>No email available</Text>
                      )}
                    </View>
                  </View>
                  {isSelected && (
                    <View style={styles.checkmark}>
                      <Ionicons name="checkmark-circle" size={32} color="#2563eb" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {entries.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {selectedIds.size} tenant{selectedIds.size !== 1 ? 's' : ''} selected
          </Text>
          <TouchableOpacity
            style={[styles.sendButton, (sending || selectedIds.size === 0) && styles.sendButtonDisabled]}
            onPress={handleSendApplication}
            disabled={sending || selectedIds.size === 0}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendButtonText}>Send Housing Application</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  positionBadge: {
    backgroundColor: '#2563eb',
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  cardDetail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 2,
  },
  noEmailText: {
    fontSize: 14,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
  },
  sendButton: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SelectTenantsScreen;

