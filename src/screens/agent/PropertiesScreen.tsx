import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { propertyService } from '../../services/propertyService';
import { Property } from '../../types';
import { colors, typography, spacing, radii } from '../../utils/theme';

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
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('EditProperty', { propertyId: item.id })}
          >
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={48} color={colors.ink200} />
            <Text style={styles.emptyTitle}>No properties yet</Text>
            <Text style={styles.emptyBody}>Add your first property to get started</Text>
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => navigation.navigate('CreateProperty')}
            >
              <Text style={styles.emptyCtaText}>+ Add Property</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  list: { padding: spacing.xl },
  addButton: {
    backgroundColor: colors.coral500,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  addButtonText: {
    color: colors.white,
    ...typography.subheading,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.ink200,
  },
  address: {
    ...typography.subheading,
    color: colors.ink900,
  },
  details: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.ink900,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.caption,
    color: colors.ink400,
    marginBottom: spacing['2xl'],
  },
  emptyCta: {
    backgroundColor: colors.coral500,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing['3xl'],
  },
  emptyCtaText: {
    color: colors.white,
    ...typography.subheading,
  },
});

export default PropertiesScreen;
