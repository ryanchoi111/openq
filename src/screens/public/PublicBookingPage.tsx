import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabaseUrl } from '../../config/supabase';
import { colors, radii, spacing, typography } from '../../utils/theme';

interface PublicBookingPageProps {
  slug: string;
  requestId?: string | null;
}

interface PublicEventType {
  id: string;
  label: string;
  durationMinutes: number;
}

interface PublicQuestion {
  id: string;
  prompt: string;
  type: string;
  required: boolean;
  options?: string[] | null;
}

interface PublicSlot {
  start: string;
  end: string;
  label: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function callFunction(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

const PublicBookingPage: React.FC<PublicBookingPageProps> = ({ slug, requestId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [requestContext, setRequestContext] = useState<any>(null);
  const [eventTypes, setEventTypes] = useState<PublicEventType[]>([]);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<PublicEventType | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const dateTo = useMemo(() => addDaysIso(Math.min(profile?.bookingHorizonDays ?? 14, 14)), [profile?.bookingHorizonDays]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError('');
      try {
        const data = await callFunction('get-public-booking-profile', { slug, request: requestId });
        setProfile(data.profile);
        setAgent(data.agent);
        setRequestContext(data.requestContext);
        setEventTypes(data.eventTypes);
        setQuestions(data.questions);
        if (data.requestContext) {
          setProspectName(data.requestContext.clientName || '');
          setProspectEmail(data.requestContext.clientEmail || '');
          setProspectPhone(data.requestContext.clientPhone || '');
        }
      } catch (err: any) {
        setError(err.message || 'Booking page unavailable');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [slug, requestId]);

  const loadSlots = async (eventType: PublicEventType) => {
    setSelectedEventType(eventType);
    setSelectedSlot(null);
    setSlotsLoading(true);
    setError('');
    try {
      const data = await callFunction('get-available-slots', {
        slug,
        request: requestId,
        eventTypeId: eventType.id,
        dateFrom: todayIso(),
        dateTo,
      });
      setSlots(data.slots);
    } catch (err: any) {
      setError(err.message || 'Failed to load availability');
    } finally {
      setSlotsLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!selectedEventType || !selectedSlot) return;
    setSubmitting(true);
    setError('');
    try {
      await callFunction('create-booking', {
        slug,
        request: requestId,
        eventTypeId: selectedEventType.id,
        start: selectedSlot.start,
        prospectName,
        prospectEmail,
        prospectPhone,
        questionResponses: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })),
      });
      setConfirmed(true);
    } catch (err: any) {
      setError(err.message === 'slot_unavailable' ? 'That time is no longer available. Please choose another slot.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.navy900} />
      </View>
    );
  }

  if (confirmed) {
    return (
      <View style={styles.centered}>
        <View style={styles.confirmCard}>
          <Text style={styles.title}>Tour confirmed</Text>
          <Text style={styles.bodyText}>Your booking has been added to the agent's calendar.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(agent?.name || slug).slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.agentName}>{agent?.name || slug}</Text>
        {requestContext?.propertyAddress && (
          <Text style={styles.propertyText}>Requested tour: {requestContext.propertyAddress}</Text>
        )}
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.eventList}>
        {eventTypes.map((eventType) => (
          <TouchableOpacity
            key={eventType.id}
            style={[styles.optionCard, selectedEventType?.id === eventType.id && styles.optionCardSelected]}
            onPress={() => loadSlots(eventType)}
          >
            <Text style={styles.optionTitle}>{eventType.label}</Text>
            <View style={styles.durationBadge}>
              <Ionicons name="time-outline" size={13} color="#e4e4e7" />
              <Text style={styles.optionSubtext}>{eventType.durationMinutes}m</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {selectedEventType && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a time</Text>
          {slotsLoading ? (
            <ActivityIndicator size="small" color={colors.navy900} />
          ) : slots.length === 0 ? (
            <Text style={styles.bodyText}>No available slots found.</Text>
          ) : (
            <View style={styles.slotGrid}>
              {slots.slice(0, 40).map((slot) => (
                <TouchableOpacity
                  key={slot.start}
                  style={[styles.slotButton, selectedSlot?.start === slot.start && styles.slotButtonSelected]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text style={[styles.slotText, selectedSlot?.start === slot.start && styles.slotTextSelected]}>{slot.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {selectedSlot && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your details</Text>
          <TextInput style={styles.input} value={prospectName} onChangeText={setProspectName} placeholder="Your name" placeholderTextColor="#71717a" />
          <TextInput style={styles.input} value={prospectEmail} onChangeText={setProspectEmail} placeholder="Email address" placeholderTextColor="#71717a" autoCapitalize="none" />
          <TextInput style={styles.input} value={prospectPhone} onChangeText={setProspectPhone} placeholder="Phone number" placeholderTextColor="#71717a" />

          {questions.map((question) => (
            <View key={question.id} style={styles.questionBlock}>
              <Text style={styles.questionLabel}>{question.prompt}{question.required ? ' *' : ''}</Text>
              {question.type === 'boolean' ? (
                <View style={styles.booleanRow}>
                  {['Yes', 'No'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.booleanButton, answers[question.id] === option && styles.booleanButtonSelected]}
                      onPress={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                    >
                      <Text style={[styles.booleanText, answers[question.id] === option && styles.booleanTextSelected]}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={[styles.input, question.type === 'textarea' && styles.textarea]}
                  value={String(answers[question.id] ?? '')}
                  onChangeText={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  multiline={question.type === 'textarea'}
                  placeholder="Answer"
                  placeholderTextColor="#71717a"
                />
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.confirmButton} onPress={confirmBooking} disabled={submitting}>
            {submitting ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.confirmText}>Confirm Booking</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  centered: {
    minHeight: '100%',
    backgroundColor: '#0f0f10',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  container: {
    minHeight: '100%',
    backgroundColor: '#0f0f10',
    paddingHorizontal: spacing.xl,
    paddingTop: 36,
    paddingBottom: 84,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: 736,
    borderWidth: 1,
    borderColor: '#2a2a2c',
    borderRadius: radii.lg,
    backgroundColor: '#121212',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing['3xl'],
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#155da8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    color: colors.white,
    fontSize: 34,
    fontWeight: '400',
  },
  agentName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fafafa',
  },
  propertyText: {
    ...typography.caption,
    color: '#a1a1aa',
    marginTop: spacing.xs,
  },
  section: {
    width: '100%',
    maxWidth: 736,
    borderWidth: 1,
    borderColor: '#2a2a2c',
    borderRadius: radii.md,
    backgroundColor: '#181818',
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.subheading,
    color: '#fafafa',
    marginBottom: spacing.lg,
  },
  eventList: {
    width: '100%',
    maxWidth: 736,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2c',
    borderRadius: radii.md,
    backgroundColor: '#181818',
    marginBottom: spacing.xl,
  },
  optionCard: {
    minHeight: 92,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2c',
    backgroundColor: '#181818',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    justifyContent: 'center',
  },
  optionCardSelected: {
    backgroundColor: '#222222',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
    marginBottom: spacing.sm,
  },
  durationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radii.sm,
    backgroundColor: '#3f3f46',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  optionSubtext: {
    fontSize: 13,
    color: '#e4e4e7',
    lineHeight: 15,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotButton: {
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: '#111111',
  },
  slotButtonSelected: {
    backgroundColor: '#fafafa',
    borderColor: '#fafafa',
  },
  slotText: {
    ...typography.caption,
    color: '#f4f4f5',
  },
  slotTextSelected: {
    color: '#111111',
  },
  input: {
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: '#111111',
    ...typography.body,
    color: '#fafafa',
    marginBottom: spacing.md,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  questionBlock: {
    marginTop: spacing.sm,
  },
  questionLabel: {
    ...typography.caption,
    color: '#f4f4f5',
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  booleanButton: {
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#111111',
  },
  booleanButtonSelected: {
    backgroundColor: '#fafafa',
    borderColor: '#fafafa',
  },
  booleanText: {
    ...typography.caption,
    color: '#f4f4f5',
  },
  booleanTextSelected: {
    color: '#111111',
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  confirmText: {
    ...typography.subheading,
    color: '#111111',
  },
  confirmCard: {
    maxWidth: 520,
    backgroundColor: '#181818',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#2a2a2c',
    padding: spacing['3xl'],
    alignItems: 'center',
  },
  title: {
    ...typography.heading,
    color: '#fafafa',
    marginBottom: spacing.sm,
  },
  bodyText: {
    ...typography.body,
    color: '#a1a1aa',
  },
  errorText: {
    width: '100%',
    maxWidth: 736,
    ...typography.caption,
    color: colors.coral500,
    marginBottom: spacing.md,
  },
});

export default PublicBookingPage;
