import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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

type Props = NativeStackScreenProps<AgentStackParamList, 'CreateProperty'>;

const CreatePropertyScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [rent, setRent] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!user?.id) return;

    try {
      await propertyService.createProperty({
        agentId: user.id,
        address,
        city,
        state,
        zip,
        bedrooms: parseInt(bedrooms),
        bathrooms: parseFloat(bathrooms),
        rent: parseFloat(rent),
        description,
      });

      Alert.alert('Success', 'Property created');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to create property');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <TextInput
          style={styles.input}
          placeholder="Address"
          value={address}
          onChangeText={setAddress}
        />
        <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />
        <TextInput style={styles.input} placeholder="State" value={state} onChangeText={setState} />
        <TextInput style={styles.input} placeholder="ZIP" value={zip} onChangeText={setZip} />
        <TextInput
          style={styles.input}
          placeholder="Bedrooms"
          value={bedrooms}
          onChangeText={setBedrooms}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Bathrooms"
          value={bathrooms}
          onChangeText={setBathrooms}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Monthly Rent"
          value={rent}
          onChangeText={setRent}
          keyboardType="numeric"
        />
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
