import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { propertyService } from '../../services/propertyService';

type Props = NativeStackScreenProps<AgentStackParamList, 'CreateProperty'>;

const CreatePropertyScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [address, setAddress] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [rent, setRent] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be signed in to create a property');
      return;
    }

    // Validate all required text fields
    const requiredTextFields = [
      { value: address.trim(), name: 'Address' },
      { value: city.trim(), name: 'City' },
      { value: state.trim(), name: 'State' },
      { value: zip.trim(), name: 'ZIP' },
    ];

    const emptyTextField = requiredTextFields.find(field => !field.value);
    if (emptyTextField) {
      Alert.alert('Required Field', `${emptyTextField.name} is required`);
      return;
    }

    // Validate required numeric fields
    if (!bedrooms || bedrooms.trim() === '') {
      Alert.alert('Required Field', 'Bedrooms is required');
      return;
    }

    if (!bathrooms || bathrooms.trim() === '') {
      Alert.alert('Required Field', 'Bathrooms is required');
      return;
    }

    if (!rent || rent.trim() === '') {
      Alert.alert('Required Field', 'Monthly Rent is required');
      return;
    }

    // Validate numeric values are valid numbers
    const bedroomsNum = parseInt(bedrooms);
    const bathroomsNum = parseFloat(bathrooms);
    const rentNum = parseFloat(rent);

    if (isNaN(bedroomsNum) || bedroomsNum < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number for bedrooms');
      return;
    }

    if (isNaN(bathroomsNum) || bathroomsNum < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number for bathrooms');
      return;
    }

    if (isNaN(rentNum) || rentNum <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid rent amount');
      return;
    }

    try {
      await propertyService.createProperty({
        agentId: user.id,
        address: address.trim(),
        address2: address2.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        bedrooms: bedroomsNum,
        bathrooms: bathroomsNum,
        rent: rentNum,
        description: description.trim(),
      });

      Alert.alert('Success', 'Property created successfully!');
      navigation.goBack();
    } catch (error: any) {
      console.error('Error creating property:', error);
      Alert.alert('Error', error.message || 'Failed to create property');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.content}>
        <Text style={styles.label}>Address *</Text>
        <TextInput
          style={styles.input}
          placeholder="Address"
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.label}>Address Line 2 (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Apt, Suite, Unit #, etc."
          value={address2}
          onChangeText={setAddress2}
        />

        <Text style={styles.label}>City *</Text>
        <TextInput
          style={styles.input}
          placeholder="City"
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>State *</Text>
        <TextInput
          style={styles.input}
          placeholder="State"
          value={state}
          onChangeText={setState}
        />

        <Text style={styles.label}>ZIP *</Text>
        <TextInput
          style={styles.input}
          placeholder="ZIP"
          value={zip}
          onChangeText={setZip}
        />

        <Text style={styles.label}>Bedrooms *</Text>
        <TextInput
          style={styles.input}
          placeholder="Bedrooms"
          value={bedrooms}
          onChangeText={setBedrooms}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Bathrooms *</Text>
        <TextInput
          style={styles.input}
          placeholder="Bathrooms"
          value={bathrooms}
          onChangeText={setBathrooms}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Monthly Rent *</Text>
        <TextInput
          style={styles.input}
          placeholder="Monthly Rent"
          value={rent}
          onChangeText={setRent}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.button} onPress={handleCreate}>
          <Text style={styles.buttonText}>Create Property</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

export default CreatePropertyScreen;
