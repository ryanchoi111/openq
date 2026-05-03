import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabaseAnonKey, supabaseUrl } from '../../config/supabase';
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

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function todayIso(): string {
  const date = new Date();
  return dateIsoFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateIsoFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function datePartsInZone(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
  };
}

function dateIsoInZone(value: string | Date, timezone: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const { year, month, day } = datePartsInZone(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateIsoFromParts(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthDateFromIso(dateIso: string): Date {
  const [year, month] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthTitle(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

function timeLabelInZone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value)).toLowerCase();
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function questionPlaceholder(question: PublicQuestion): string {
  const prompt = question.prompt.toLowerCase();
  if (question.type === 'date') return 'YYYY-MM-DD';
  if (question.type === 'number' && prompt.includes('budget')) return 'Monthly budget';
  if (prompt.includes('roommate')) return 'i.e John Doe: 525-667-8273, john@example.com';
  return 'Answer';
}

function sanitizeNumberInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const [whole, ...decimalParts] = cleaned.split('.');
  return decimalParts.length > 0 ? `${whole}.${decimalParts.join('')}` : whole;
}

function sanitizePhoneInput(value: string): string {
  return value.replace(/[^0-9+\-().\s]/g, '');
}

function isValidDateAnswer(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidNumberAnswer(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).trim();
  return text !== '' && Number.isFinite(Number(text));
}

function validateQuestionAnswers(questions: PublicQuestion[], answers: Record<string, unknown>): string | null {
  for (const question of questions) {
    const answer = answers[question.id];
    const text = String(answer ?? '').trim();
    if (question.required && !text) return `Missing required answer: ${question.prompt}`;
    if (!text) continue;
    if (question.type === 'date' && !isValidDateAnswer(answer)) return `Enter a valid date for: ${question.prompt}`;
    if (question.type === 'number' && !isValidNumberAnswer(answer)) return `Enter a valid number for: ${question.prompt}`;
  }
  return null;
}

async function callFunction(name: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
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
  const [notFound, setNotFound] = useState(false);
  const [agent, setAgent] = useState<any>(null);
  const [requestContext, setRequestContext] = useState<any>(null);
  const [eventTypes, setEventTypes] = useState<PublicEventType[]>([]);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<PublicEventType | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDateIso, setSelectedDateIso] = useState('');
  const [visibleMonth, setVisibleMonth] = useState(() => monthDateFromIso(todayIso()));
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [prospectName, setProspectName] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState('');

  const updateAnswer = (questionId: string, answer: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setFormError('');
  };

  const dateTo = useMemo(() => addDaysIso(Math.min(profile?.bookingHorizonDays ?? 14, 14)), [profile?.bookingHorizonDays]);
  const timezone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const localTimeFloorMinutes = useMemo(() => minutesSinceMidnight(new Date()), []);
  const visibleSlots = useMemo(() => {
    return slots.filter((slot) => minutesSinceMidnight(new Date(slot.start)) >= localTimeFloorMinutes);
  }, [localTimeFloorMinutes, slots]);
  const availableDates = useMemo(() => {
    return new Set(visibleSlots.map((slot) => dateIsoInZone(slot.start, timezone)));
  }, [visibleSlots, timezone]);
  const selectedDateSlots = useMemo(() => {
    return visibleSlots.filter((slot) => dateIsoInZone(slot.start, timezone) === selectedDateIso);
  }, [selectedDateIso, visibleSlots, timezone]);
  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    return Array.from({ length: 42 }, (_, index) => {
      const dayOffset = index - firstDay + 1;
      let day = dayOffset;
      let inMonth = true;
      let dateYear = year;
      let dateMonth = month;

      if (dayOffset < 1) {
        day = previousMonthDays + dayOffset;
        inMonth = false;
        dateMonth = month - 1;
        if (dateMonth < 0) {
          dateMonth = 11;
          dateYear -= 1;
        }
      } else if (dayOffset > daysInMonth) {
        day = dayOffset - daysInMonth;
        inMonth = false;
        dateMonth = month + 1;
        if (dateMonth > 11) {
          dateMonth = 0;
          dateYear += 1;
        }
      }

      const dateIso = dateIsoFromParts(dateYear, dateMonth, day);
      return {
        dateIso,
        day,
        inMonth,
        hasSlots: availableDates.has(dateIso),
      };
    });
  }, [availableDates, visibleMonth]);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError('');
      setNotFound(false);
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
        if (err.message === 'booking_profile_not_found') {
          setNotFound(true);
        } else {
          setError(err.message || 'Booking page unavailable');
        }
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [slug, requestId]);

  const loadSlots = async (eventType: PublicEventType) => {
    setSelectedEventType(eventType);
    setSelectedSlot(null);
    setSelectedDateIso('');
    setSlotsLoading(true);
    setError('');
    try {
      const data = await callFunction('get-available-slots', {
        slug,
        request: requestId,
        eventTypeId: eventType.id,
        dateFrom: todayIso(),
        dateTo,
        clientNow: new Date().toISOString(),
      });
      const nextSlots = data.slots ?? [];
      const nextVisibleSlots = nextSlots.filter((slot: PublicSlot) => (
        minutesSinceMidnight(new Date(slot.start)) >= localTimeFloorMinutes
      ));
      setSlots(nextSlots);
      const firstSlot = nextVisibleSlots[0];
      if (firstSlot) {
        const firstDateIso = dateIsoInZone(firstSlot.start, timezone);
        setSelectedDateIso(firstDateIso);
        setVisibleMonth(monthDateFromIso(firstDateIso));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load availability');
    } finally {
      setSlotsLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!selectedEventType || !selectedSlot) return;
    setFormError('');
    if (!prospectName.trim() || !prospectEmail.trim() || !prospectPhone.trim()) {
      setFormError('Please fill out all required fields.');
      return;
    }
    const questionError = validateQuestionAnswers(questions, answers);
    if (questionError) {
      setFormError(questionError);
      return;
    }
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

  const renderWebDateInput = (question: PublicQuestion) => (
    React.createElement('input' as any, {
      type: 'date',
      value: String(answers[question.id] ?? ''),
      onChange: (event: any) => updateAnswer(question.id, event.target.value),
      style: StyleSheet.flatten(styles.webInput) as any,
    })
  );

  const renderWebNumberInput = (question: PublicQuestion) => (
    React.createElement('input' as any, {
      type: 'number',
      inputMode: 'decimal',
      min: '0',
      step: '1',
      value: String(answers[question.id] ?? ''),
      placeholder: questionPlaceholder(question),
      onChange: (event: any) => updateAnswer(question.id, sanitizeNumberInput(event.target.value)),
      onKeyDown: (event: any) => {
        if (event.key.length === 1 && !/[0-9.]/.test(event.key)) event.preventDefault();
      },
      style: StyleSheet.flatten(styles.webInput) as any,
    })
  );

  const renderQuestionInput = (question: PublicQuestion) => {
    if (question.type === 'boolean') {
      return (
        <View style={styles.booleanRow}>
          {['Yes', 'No'].map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.booleanButton, answers[question.id] === option && styles.booleanButtonSelected]}
              onPress={() => updateAnswer(question.id, option)}
            >
              <Text style={[styles.booleanText, answers[question.id] === option && styles.booleanTextSelected]}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (Platform.OS === 'web' && question.type === 'date') return renderWebDateInput(question);
    if (Platform.OS === 'web' && question.type === 'number') return renderWebNumberInput(question);

    return (
      <TextInput
        style={[styles.input, question.type === 'textarea' && styles.textarea]}
        value={String(answers[question.id] ?? '')}
        onChangeText={(value) => updateAnswer(question.id, question.type === 'number' ? sanitizeNumberInput(value) : value)}
        multiline={question.type === 'textarea'}
        keyboardType={question.type === 'number' ? 'numeric' : 'default'}
        placeholder={questionPlaceholder(question)}
        placeholderTextColor="#71717a"
      />
    );
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

  if (notFound) {
    return (
      <View style={styles.notFoundPage}>
        <View style={styles.notFoundCard}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="calendar-clear-outline" size={24} color="#fafafa" />
          </View>
          <Text style={styles.notFoundTitle}>Booking link not found</Text>
          <Text style={styles.notFoundText}>
            This booking link does not exist or is no longer active. Check the URL and try again.
          </Text>
          <Text style={styles.notFoundSlug}>/{slug}</Text>
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
          ) : visibleSlots.length === 0 ? (
            <Text style={styles.bodyText}>No available slots found.</Text>
          ) : (
            <View>
              <View style={styles.calendarHeader}>
                <Text style={styles.calendarTitle}>{monthTitle(visibleMonth)}</Text>
                <View style={styles.calendarNav}>
                  <TouchableOpacity style={styles.navButton} onPress={() => setVisibleMonth((current) => addMonths(current, -1))}>
                    <Ionicons name="chevron-back" size={18} color="#a1a1aa" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.navButton} onPress={() => setVisibleMonth((current) => addMonths(current, 1))}>
                    <Ionicons name="chevron-forward" size={18} color="#a1a1aa" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((weekday) => (
                  <Text key={weekday} style={styles.weekdayText}>{weekday}</Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                  const selected = day.dateIso === selectedDateIso;
                  const disabled = !day.inMonth || !day.hasSlots;
                  return (
                    <TouchableOpacity
                      key={`${day.dateIso}-${index}`}
                      style={[
                        styles.dayButton,
                        !day.inMonth && styles.dayButtonMuted,
                        day.hasSlots && day.inMonth && styles.dayButtonAvailable,
                        selected && styles.dayButtonSelected,
                      ]}
                      disabled={disabled}
                      onPress={() => {
                        setSelectedDateIso(day.dateIso);
                        setSelectedSlot(null);
                      }}
                    >
                      <Text style={[
                        styles.dayText,
                        !day.inMonth && styles.dayTextMuted,
                        day.hasSlots && day.inMonth && styles.dayTextAvailable,
                        selected && styles.dayTextSelected,
                      ]}>
                        {day.day}
                      </Text>
                      {day.hasSlots && day.inMonth && !selected && <View style={styles.availabilityDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.timesPanel}>
                <Text style={styles.timesTitle}>
                  {new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${selectedDateIso}T12:00:00`))}
                </Text>
                <View style={styles.slotGrid}>
                  {selectedDateSlots.map((slot) => (
                    <TouchableOpacity
                      key={slot.start}
                      style={[styles.slotButton, selectedSlot?.start === slot.start && styles.slotButtonSelected]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <View style={[styles.slotDot, selectedSlot?.start === slot.start && styles.slotDotSelected]} />
                      <Text style={[styles.slotText, selectedSlot?.start === slot.start && styles.slotTextSelected]}>{timeLabelInZone(slot.start, timezone)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {selectedSlot && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your details</Text>
          <TextInput style={styles.input} value={prospectName} onChangeText={(value) => { setProspectName(value); setFormError(''); }} placeholder="Your name *" placeholderTextColor="#71717a" />
          <TextInput style={styles.input} value={prospectEmail} onChangeText={(value) => { setProspectEmail(value); setFormError(''); }} placeholder="Email address *" placeholderTextColor="#71717a" autoCapitalize="none" keyboardType="email-address" />
          <TextInput
            style={styles.input}
            value={prospectPhone}
            onChangeText={(value) => {
              setProspectPhone(sanitizePhoneInput(value));
              setFormError('');
            }}
            placeholder="Phone number *"
            placeholderTextColor="#71717a"
            keyboardType="phone-pad"
          />

          {questions.map((question) => (
            <View key={question.id} style={styles.questionBlock}>
              <Text style={styles.questionLabel}>{question.prompt}{question.required ? ' *' : ''}</Text>
              {renderQuestionInput(question)}
            </View>
          ))}

          {!!formError && (
            <View style={styles.inlineAlert}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.coral500} />
              <Text style={styles.inlineAlertText}>{formError}</Text>
            </View>
          )}

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
  notFoundPage: {
    minHeight: '100%',
    backgroundColor: '#0f0f10',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  notFoundCard: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: '#2a2a2c',
    borderRadius: radii.lg,
    backgroundColor: '#181818',
    padding: spacing['3xl'],
    alignItems: 'center',
  },
  notFoundIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  notFoundTitle: {
    ...typography.heading,
    color: '#fafafa',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  notFoundText: {
    ...typography.body,
    color: '#a1a1aa',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  notFoundSlug: {
    ...typography.caption,
    color: '#71717a',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2a2a2c',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f4f4f5',
  },
  calendarNav: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2a2a2c',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#d4d4d8',
    letterSpacing: 0,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  dayButton: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonAvailable: {
    borderRadius: radii.md,
  },
  dayButtonMuted: {
    opacity: 0.25,
  },
  dayButtonSelected: {
    backgroundColor: '#fafafa',
    borderRadius: radii.md,
  },
  dayText: {
    fontSize: 14,
    color: '#71717a',
  },
  dayTextAvailable: {
    color: '#f4f4f5',
    fontWeight: '600',
  },
  dayTextMuted: {
    color: '#52525b',
  },
  dayTextSelected: {
    color: '#111111',
    fontWeight: '700',
  },
  availabilityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#34d399',
    marginTop: 4,
  },
  timesPanel: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2c',
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
  },
  timesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: spacing.md,
  },
  slotButton: {
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: radii.md,
    minWidth: 136,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  slotButtonSelected: {
    backgroundColor: '#fafafa',
    borderColor: '#fafafa',
  },
  slotText: {
    ...typography.caption,
    color: '#f4f4f5',
    fontWeight: '600',
  },
  slotTextSelected: {
    color: '#111111',
  },
  slotDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  slotDotSelected: {
    backgroundColor: '#111111',
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
  webInput: {
    width: '100%',
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    boxSizing: 'border-box',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#3f3f46',
    borderRadius: radii.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#111111',
    fontSize: 14,
    lineHeight: 20,
    color: '#fafafa',
    marginBottom: spacing.md,
    outlineColor: '#2684ff',
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
  inlineAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  inlineAlertText: {
    ...typography.caption,
    color: '#fecaca',
    fontWeight: '600',
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
