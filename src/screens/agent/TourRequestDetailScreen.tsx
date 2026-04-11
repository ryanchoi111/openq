import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import type { AgentUser } from '../../types';
import type { TourRequest } from '../../types/gmail';

type Props = NativeStackScreenProps<AgentStackParamList, 'TourRequestDetail'>;

function buildDefaultBody(calLink: string, tourRequest: TourRequest, user: AgentUser | null): string {
  const address = tourRequest.propertyAddress || 'the property';
  let body = `Hi ${tourRequest.clientName},\n\nThank you for your interest in ${address}!`;
  if (calLink) body += ` Book a tour using this link: ${calLink}`;
  body += `\n\nBest regards,\n${user?.name || 'Agent'}`;
  return body;
}

const TourRequestDetailScreen: React.FC<Props> = ({ route }) => {
  const { tourRequest } = route.params;
  const { user } = useAuth();
  const agent = user as AgentUser;
  const calLink = agent?.cal_link || '';
  const [emailBody, setEmailBody] = useState(() => buildDefaultBody(calLink, tourRequest, agent));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const subject = `Tour Request: ${tourRequest.propertyAddress || 'Property'}`;

  const handleSend = async () => {
    if (!tourRequest.clientEmail) {
      Alert.alert('Error', 'No client email available');
      return;
    }
    if (!emailBody.trim()) {
      Alert.alert('Error', 'Email body cannot be empty');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-tour-email', {
        body: {
          to: tourRequest.clientEmail,
          subject,
          emailBody: emailBody.trim(),
          agentName: user?.name || 'Agent',
          agentEmail: user?.email || '',
        },
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Failed to send');

      setSent(true);
      Alert.alert('Sent', `Email sent to ${tourRequest.clientEmail}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Property Header */}
        <View style={styles.headerCard}>
          <Ionicons name="home" size={24} color="#2563eb" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.addressText}>{tourRequest.propertyAddress || 'Unknown Address'}</Text>
            <Text style={styles.dateText}>
              Received {new Date(tourRequest.receivedAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        {/* Client Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={18} color="#64748b" />
              <Text style={styles.infoText}>{tourRequest.clientName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={18} color="#64748b" />
              <Text style={styles.infoText}>{tourRequest.clientEmail || 'No email'}</Text>
            </View>
            {tourRequest.clientPhone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={18} color="#64748b" />
                <Text style={styles.infoText}>{tourRequest.clientPhone}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Subject (read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subject</Text>
          <View style={styles.subjectBox}>
            <Text style={styles.subjectText}>{subject}</Text>
          </View>
        </View>

        {/* Email Body */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email Body</Text>
          <TextInput
            style={styles.emailBodyInput}
            value={emailBody}
            onChangeText={setEmailBody}
            multiline
            textAlignVertical="top"
            editable={!sent}
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendButton, sent && styles.sendButtonSent]}
          onPress={handleSend}
          disabled={sending || sent || !tourRequest.clientEmail}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : sent ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Sent</Text>
            </>
          ) : (
            <>
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Send Email</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  addressText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  dateText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    fontSize: 15,
    color: '#1e293b',
  },
  subjectBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
  },
  subjectText: {
    fontSize: 15,
    color: '#475569',
  },
  emailBodyInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 180,
    lineHeight: 22,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  sendButtonSent: {
    backgroundColor: '#16a34a',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default TourRequestDetailScreen;
