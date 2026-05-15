import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import {
  bookingService,
  buildBookingUrl,
  createDefaultEventTypes,
  createDefaultProfile,
  createDefaultQuestions,
  sanitizeBookingSlug,
} from '../../services/bookingService';
import type { AgentBookingProfile, BookingAvailabilityWindow, BookingEventType, BookingQuestion, BookingQuestionType } from '../../types/booking';
import { colors, radii, spacing, typography } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'BookingSettings'>;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const QUESTION_TYPES: BookingQuestionType[] = ['text', 'textarea', 'number', 'date', 'boolean', 'single_select'];

type EditableEventType = Partial<BookingEventType> & {
  localId: string;
  label: string;
  duration_minutes: number;
};

type EditableQuestion = Partial<BookingQuestion> & {
  localId: string;
  prompt: string;
  question_type: BookingQuestionType;
};

function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getWindowForDay(windows: BookingAvailabilityWindow[], day: number): BookingAvailabilityWindow | undefined {
  return windows.find((window) => window.day === day);
}

function replaceWindow(windows: BookingAvailabilityWindow[], next: BookingAvailabilityWindow): BookingAvailabilityWindow[] {
  const filtered = windows.filter((window) => window.day !== next.day);
  return [...filtered, next].sort((a, b) => a.day - b.day);
}

const BookingSettingsScreen: React.FC<Props> = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<AgentBookingProfile | null>(null);
  const [eventTypes, setEventTypes] = useState<EditableEventType[]>([]);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);

  const bookingUrl = useMemo(() => {
    if (!profile?.slug) return '';
    return buildBookingUrl(profile.slug);
  }, [profile?.slug]);

  const loadSettings = useCallback(async () => {
    if (!user || user.role !== 'agent') return;
    setLoading(true);
    try {
      const settings = await bookingService.getSettings(user.id);
      const nextProfile = settings.profile ?? createDefaultProfile(user.id, user.name);
      const nextEventTypes = settings.eventTypes.length > 0
        ? settings.eventTypes
        : createDefaultEventTypes(user.id);
      const nextQuestions = settings.questions.length > 0
        ? settings.questions
        : createDefaultQuestions(user.id);

      setProfile(nextProfile);
      setEventTypes(nextEventTypes.map((eventType) => ({
        ...eventType,
        localId: 'id' in eventType && typeof eventType.id === 'string' ? eventType.id : makeLocalId(),
      })));
      setQuestions(nextQuestions.map((question) => ({
        ...question,
        localId: 'id' in question && typeof question.id === 'string' ? question.id : makeLocalId(),
      })));
    } catch {
      Alert.alert('Settings unavailable', 'We could not load booking settings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateProfile = (updates: Partial<AgentBookingProfile>) => {
    setProfile((current) => (current ? { ...current, ...updates } : current));
  };

  const openBookingLink = async () => {
    if (!bookingUrl) return;
    if (!profile?.booking_enabled) {
      Alert.alert('Booking is private', 'Enable booking and save your settings before sharing this link.');
      return;
    }
    try {
      await Linking.openURL(bookingUrl);
    } catch {
      Alert.alert('Unable to open link', bookingUrl);
    }
  };

  const toggleDay = (day: number, enabled: boolean) => {
    if (!profile) return;
    if (!enabled) {
      updateProfile({ working_hours: profile.working_hours.filter((window) => window.day !== day) });
      return;
    }
    updateProfile({
      working_hours: replaceWindow(profile.working_hours, { day, start: '10:00', end: '18:00' }),
    });
  };

  const updateDayWindow = (day: number, updates: Partial<BookingAvailabilityWindow>) => {
    if (!profile) return;
    const current = getWindowForDay(profile.working_hours, day) ?? { day, start: '10:00', end: '18:00' };
    updateProfile({ working_hours: replaceWindow(profile.working_hours, { ...current, ...updates }) });
  };

  const addEventType = () => {
    if (!user || user.role !== 'agent') return;
    setEventTypes((current) => [
      ...current,
      {
        localId: makeLocalId(),
        agent_id: user.id,
        label: '45 min tour',
        duration_minutes: 45,
        buffer_before_minutes: 0,
        buffer_after_minutes: 15,
        enabled: true,
      },
    ]);
  };

  const addQuestion = () => {
    if (!user || user.role !== 'agent') return;
    setQuestions((current) => [
      ...current,
      {
        localId: makeLocalId(),
        agent_id: user.id,
        prompt: 'What is your move-in date?',
        question_type: 'date',
        required: false,
        options: null,
        enabled: true,
      },
    ]);
  };

  const saveSettings = async () => {
    if (!user || user.role !== 'agent' || !profile) return;
    const slug = sanitizeBookingSlug(profile.slug);
    if (!slug) {
      Alert.alert('Slug required', 'Enter a public booking slug.');
      return;
    }
    const enabledEventTypes = eventTypes.filter((eventType) => eventType.enabled !== false);
    if (profile.booking_enabled && enabledEventTypes.length === 0) {
      Alert.alert('Duration required', 'Add at least one enabled booking duration before enabling booking.');
      return;
    }
    if (eventTypes.some((eventType) => !eventType.label.trim() || !Number.isFinite(Number(eventType.duration_minutes)))) {
      Alert.alert('Invalid duration option', 'Every duration option needs a label and valid duration.');
      return;
    }
    if (questions.some((question) => !question.prompt.trim())) {
      Alert.alert('Invalid question', 'Every intake question needs prompt text.');
      return;
    }
    if (profile.booking_enabled && profile.working_hours.length === 0) {
      Alert.alert('Availability required', 'Add at least one available day before enabling booking.');
      return;
    }

    setSaving(true);
    try {
      const savedProfile = await bookingService.saveProfile({ ...profile, slug });
      const savedEventTypes = await bookingService.replaceEventTypes(user.id, eventTypes);
      const savedQuestions = await bookingService.replaceQuestions(user.id, questions);

      setProfile(savedProfile);
      setEventTypes(savedEventTypes.map((eventType) => ({ ...eventType, localId: eventType.id })));
      setQuestions(savedQuestions.map((question) => ({ ...question, localId: question.id })));
      Alert.alert(
        'Saved',
        savedProfile.booking_enabled ? 'Your public booking link is active.' : 'Booking settings updated',
        savedProfile.booking_enabled
          ? [
              { text: 'Close', style: 'cancel' },
              { text: 'Open Link', onPress: () => Linking.openURL(buildBookingUrl(savedProfile.slug)) },
            ]
          : undefined,
      );
    } catch {
      Alert.alert('Save failed', 'We could not save booking settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.role !== 'agent') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Booking settings are only available for agents.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.navy900} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Public Booking Page</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.cardTitle}>Enable booking</Text>
                <Text style={styles.helpText}>Prospects can book confirmed tours from your public link.</Text>
              </View>
              <Switch
                value={profile.booking_enabled}
                onValueChange={(value) => updateProfile({ booking_enabled: value })}
                trackColor={{ false: colors.ink200, true: colors.navy400 }}
                thumbColor={colors.white}
              />
            </View>

            <Text style={styles.label}>Slug</Text>
            <View style={styles.slugRow}>
              <Text style={styles.slugPrefix}>www.openqapp.xyz/</Text>
              <TextInput
                style={styles.slugInput}
                value={profile.slug}
                onChangeText={(value) => updateProfile({ slug: sanitizeBookingSlug(value) })}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ryan"
                placeholderTextColor={colors.ink400}
              />
            </View>
            {!!bookingUrl && (
              <View style={styles.linkPreviewRow}>
                <Text style={styles.previewText}>{bookingUrl}</Text>
                <TouchableOpacity
                  style={[styles.openLinkButton, !profile.booking_enabled && styles.openLinkButtonDisabled]}
                  onPress={openBookingLink}
                  disabled={!profile.booking_enabled}
                >
                  <Ionicons
                    name="open-outline"
                    size={16}
                    color={profile.booking_enabled ? colors.navy900 : colors.ink400}
                  />
                  <Text style={[styles.openLinkText, !profile.booking_enabled && styles.openLinkTextDisabled]}>
                    Open
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Timezone</Text>
                <TextInput
                  style={styles.input}
                  value={profile.timezone}
                  onChangeText={(value) => updateProfile({ timezone: value })}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Horizon days</Text>
                <TextInput
                  style={styles.input}
                  value={String(profile.default_booking_horizon_days)}
                  onChangeText={(value) => updateProfile({ default_booking_horizon_days: Number(value) || 1 })}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Minimum notice min</Text>
                <TextInput
                  style={styles.input}
                  value={String(profile.minimum_notice_minutes)}
                  onChangeText={(value) => updateProfile({ minimum_notice_minutes: Number(value) || 0 })}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Slot increment min</Text>
                <TextInput
                  style={styles.input}
                  value={String(profile.slot_increment_minutes)}
                  onChangeText={(value) => updateProfile({ slot_increment_minutes: Number(value) || 30 })}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Availability</Text>
          <View style={styles.card}>
            {DAYS.map((label, day) => {
              const window = getWindowForDay(profile.working_hours, day);
              const enabled = !!window;
              return (
                <View key={label} style={styles.dayRow}>
                  <View style={styles.dayToggle}>
                    <Switch
                      value={enabled}
                      onValueChange={(value) => toggleDay(day, value)}
                      trackColor={{ false: colors.ink200, true: colors.navy400 }}
                      thumbColor={colors.white}
                    />
                    <Text style={styles.dayLabel}>{label}</Text>
                  </View>
                  <View style={styles.timeInputs}>
                    <TextInput
                      style={[styles.timeInput, !enabled && styles.disabledInput]}
                      value={window?.start ?? ''}
                      onChangeText={(value) => updateDayWindow(day, { start: value })}
                      editable={enabled}
                      placeholder="10:00"
                      placeholderTextColor={colors.ink400}
                    />
                    <Text style={styles.timeDash}>to</Text>
                    <TextInput
                      style={[styles.timeInput, !enabled && styles.disabledInput]}
                      value={window?.end ?? ''}
                      onChangeText={(value) => updateDayWindow(day, { end: value })}
                      editable={enabled}
                      placeholder="18:00"
                      placeholderTextColor={colors.ink400}
                    />
                  </View>
                </View>
              );
            })}
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Buffer before min</Text>
                <TextInput
                  style={styles.input}
                  value={String(profile.default_buffer_before_minutes)}
                  onChangeText={(value) => updateProfile({ default_buffer_before_minutes: Number(value) || 0 })}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Buffer after min</Text>
                <TextInput
                  style={styles.input}
                  value={String(profile.default_buffer_after_minutes)}
                  onChangeText={(value) => updateProfile({ default_buffer_after_minutes: Number(value) || 0 })}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Duration Options</Text>
            <TouchableOpacity style={styles.smallButton} onPress={addEventType}>
              <Ionicons name="add" size={18} color={colors.navy900} />
              <Text style={styles.smallButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          {eventTypes.map((eventType, index) => (
            <View key={eventType.localId} style={styles.card}>
              <View style={styles.switchRow}>
                <Text style={styles.cardTitle}>Option {index + 1}</Text>
                <TouchableOpacity
                  onPress={() => setEventTypes((current) => current.filter((item) => item.localId !== eventType.localId))}
                  disabled={eventTypes.length === 1}
                >
                  <Ionicons name="trash-outline" size={20} color={eventTypes.length === 1 ? colors.ink400 : colors.coral500} />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Label</Text>
              <TextInput
                style={styles.input}
                value={eventType.label}
                onChangeText={(value) =>
                  setEventTypes((current) => current.map((item) => item.localId === eventType.localId ? { ...item, label: value } : item))
                }
              />
              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <Text style={styles.label}>Duration min</Text>
                  <TextInput
                    style={styles.input}
                    value={String(eventType.duration_minutes)}
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      setEventTypes((current) => current.map((item) => item.localId === eventType.localId ? { ...item, duration_minutes: Number(value) || 5 } : item))
                    }
                  />
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.label}>After buffer</Text>
                  <TextInput
                    style={styles.input}
                    value={String(eventType.buffer_after_minutes ?? 0)}
                    keyboardType="number-pad"
                    onChangeText={(value) =>
                      setEventTypes((current) => current.map((item) => item.localId === eventType.localId ? { ...item, buffer_after_minutes: Number(value) || 0 } : item))
                    }
                  />
                </View>
              </View>
              <View style={styles.inlineSwitch}>
                <Text style={styles.helpText}>Enabled</Text>
                <Switch
                  value={eventType.enabled !== false}
                  onValueChange={(value) =>
                    setEventTypes((current) => current.map((item) => item.localId === eventType.localId ? { ...item, enabled: value } : item))
                  }
                />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Intake Questions</Text>
            <TouchableOpacity style={styles.smallButton} onPress={addQuestion}>
              <Ionicons name="add" size={18} color={colors.navy900} />
              <Text style={styles.smallButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          {questions.map((question, index) => (
            <View key={question.localId} style={styles.card}>
              <View style={styles.switchRow}>
                <Text style={styles.cardTitle}>Question {index + 1}</Text>
                <TouchableOpacity
                  onPress={() => setQuestions((current) => current.filter((item) => item.localId !== question.localId))}
                  disabled={questions.length === 1}
                >
                  <Ionicons name="trash-outline" size={20} color={questions.length === 1 ? colors.ink400 : colors.coral500} />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Prompt</Text>
              <TextInput
                style={styles.input}
                value={question.prompt}
                onChangeText={(value) =>
                  setQuestions((current) => current.map((item) => item.localId === question.localId ? { ...item, prompt: value } : item))
                }
              />
              <Text style={styles.label}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                {QUESTION_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, question.question_type === type && styles.typeChipSelected]}
                    onPress={() =>
                      setQuestions((current) => current.map((item) => item.localId === question.localId ? { ...item, question_type: type } : item))
                    }
                  >
                    <Text style={[styles.typeChipText, question.question_type === type && styles.typeChipTextSelected]}>
                      {type.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {question.question_type === 'single_select' && (
                <>
                  <Text style={styles.label}>Options, comma separated</Text>
                  <TextInput
                    style={styles.input}
                    value={(question.options ?? []).join(', ')}
                    onChangeText={(value) =>
                      setQuestions((current) => current.map((item) => item.localId === question.localId ? {
                        ...item,
                        options: value.split(',').map((option) => option.trim()).filter(Boolean),
                      } : item))
                    }
                  />
                </>
              )}
              <View style={styles.questionToggles}>
                <View style={styles.inlineSwitch}>
                  <Text style={styles.helpText}>Required</Text>
                  <Switch
                    value={question.required ?? false}
                    onValueChange={(value) =>
                      setQuestions((current) => current.map((item) => item.localId === question.localId ? { ...item, required: value } : item))
                    }
                  />
                </View>
                <View style={styles.inlineSwitch}>
                  <Text style={styles.helpText}>Enabled</Text>
                  <Switch
                    value={question.enabled !== false}
                    onValueChange={(value) =>
                      setQuestions((current) => current.map((item) => item.localId === question.localId ? { ...item, enabled: value } : item))
                    }
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveSettings} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color={colors.white} />
              <Text style={styles.saveButtonText}>Save Booking Settings</Text>
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
    backgroundColor: colors.white,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 48,
  },
  section: {
    marginBottom: spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.ink900,
    marginBottom: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.ink900,
  },
  helpText: {
    ...typography.caption,
    color: colors.ink600,
  },
  mutedText: {
    ...typography.body,
    color: colors.ink600,
    textAlign: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  switchText: {
    flex: 1,
  },
  label: {
    ...typography.small,
    color: colors.ink600,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.body,
    color: colors.ink900,
    backgroundColor: colors.white,
  },
  disabledInput: {
    backgroundColor: colors.ink50,
    color: colors.ink400,
  },
  slugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  slugPrefix: {
    ...typography.body,
    color: colors.ink600,
    backgroundColor: colors.ink50,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  slugInput: {
    flex: 1,
    ...typography.body,
    color: colors.ink900,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  previewText: {
    flex: 1,
    ...typography.caption,
    color: colors.navy700,
  },
  linkPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  openLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  openLinkButtonDisabled: {
    backgroundColor: colors.ink50,
  },
  openLinkText: {
    ...typography.small,
    color: colors.navy900,
  },
  openLinkTextDisabled: {
    color: colors.ink400,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 100,
  },
  dayLabel: {
    ...typography.subheading,
    color: colors.ink900,
  },
  timeInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink200,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    ...typography.body,
    color: colors.ink900,
  },
  timeDash: {
    ...typography.caption,
    color: colors.ink600,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.navy50,
  },
  smallButtonText: {
    ...typography.small,
    color: colors.navy900,
  },
  inlineSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  questionToggles: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  typeChipSelected: {
    backgroundColor: colors.navy900,
    borderColor: colors.navy900,
  },
  typeChipText: {
    ...typography.small,
    color: colors.ink600,
    textTransform: 'capitalize',
  },
  typeChipTextSelected: {
    color: colors.white,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.navy900,
  },
  saveButtonText: {
    ...typography.subheading,
    color: colors.white,
  },
});

export default BookingSettingsScreen;
