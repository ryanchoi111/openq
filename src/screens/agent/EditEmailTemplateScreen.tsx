import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { emailTemplateService } from '../../services/emailTemplateService';

type Props = NativeStackScreenProps<AgentStackParamList, 'EditEmailTemplate'>;

const CHARACTER_LIMIT = 2000;

const EditEmailTemplateScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [template, setTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const savedTemplate = await emailTemplateService.getEmailTemplate(user.id);
      setTemplate(savedTemplate);
    } catch (error) {
      console.error('Error loading template:', error);
      Alert.alert('Error', 'Failed to load email template');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    if (template.trim().length === 0) {
      Alert.alert('Invalid Template', 'Email template cannot be empty');
      return;
    }

    if (template.length > CHARACTER_LIMIT) {
      Alert.alert(
        'Template Too Long',
        `Please keep your template under ${CHARACTER_LIMIT} characters`
      );
      return;
    }

    try {
      setSaving(true);
      await emailTemplateService.saveEmailTemplate(user.id, template);
      Alert.alert('Success', 'Email template saved successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error saving template:', error);
      Alert.alert('Error', error.message || 'Failed to save email template');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset to Default',
      'Are you sure you want to reset to the default template? Your current template will be lost.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const defaultTemplate = emailTemplateService.getDefaultTemplate();
            setTemplate(defaultTemplate);
          },
        },
      ]
    );
  };

  const characterCount = template.length;
  const characterCountColor = characterCount > CHARACTER_LIMIT ? '#ef4444' : '#64748b';
  const isOverLimit = characterCount > CHARACTER_LIMIT;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Email Template</Text>
        <Text style={styles.subtitle}>
          Customize the email sent with housing applications
        </Text>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#2563eb" />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>Available Placeholders:</Text>
            <Text style={styles.infoText}>
              <Text style={styles.placeholder}>{'$NAME_OF_TENANT'}</Text> - Recipient's name
            </Text>
            <Text style={styles.infoText}>
              <Text style={styles.placeholder}>{'$ADDRESS_OF_INTERESTED_HOUSE'}</Text> - Property address
            </Text>
            <Text style={styles.infoText}>
              <Text style={styles.placeholder}>{'$NAME_OF_AGENT'}</Text> - Your name
            </Text>
          </View>
        </View>

        {/* Template Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              isOverLimit && styles.inputError,
            ]}
            value={template}
            onChangeText={setTemplate}
            placeholder={emailTemplateService.getDefaultTemplate()}
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={CHARACTER_LIMIT + 100} // Allow typing slightly over to see error
          />
          <View style={styles.characterCountContainer}>
            <Text style={[styles.characterCount, { color: characterCountColor }]}>
              {characterCount} / {CHARACTER_LIMIT}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.saveButton, (saving || isOverLimit) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving || isOverLimit}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.buttonText}>Save Template</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.resetButton]}
            onPress={handleReset}
            disabled={saving}
          >
            <Ionicons name="refresh" size={20} color="#ef4444" />
            <Text style={styles.resetButtonText}>Reset to Default</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 24,
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  placeholder: {
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 300,
    maxHeight: 400,
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  characterCountContainer: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  characterCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  saveButton: {
    backgroundColor: '#2563eb',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  resetButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EditEmailTemplateScreen;

