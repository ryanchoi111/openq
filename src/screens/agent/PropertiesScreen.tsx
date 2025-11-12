import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { propertyService } from '../../services/propertyService';
import { Property } from '../../types';

type Props = NativeStackScreenProps<AgentStackParamList, 'Properties'>;

const PropertiesScreen: React.FC<Props> = ({ navigation }) => {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);

  // Reload properties whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProperties();
    }, [user?.id])
  );

  const loadProperties = async () => {
    if (!user?.id) return;
    const data = await propertyService.getAgentProperties(user.id);
    setProperties(data);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('CreateProperty')}
          >
            <Text style={styles.addButtonText}>+ Add Property</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <Text style={styles.address}>
              {item.address}
              {item.address2 ? ` ${item.address2}` : ''}
            </Text>
            <Text style={styles.details}>
              {item.bedrooms}bd • {item.bathrooms}ba • ${item.rent}/mo
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  list: { padding: 20 },
  addButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 8, marginBottom: 16 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 12 },
  address: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  details: { fontSize: 14, color: '#64748b', marginTop: 4 },
});

export default PropertiesScreen;
