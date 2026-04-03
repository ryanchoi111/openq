import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import type { TourRequest } from '../../types/gmail';
import { colors, typography, spacing, radii } from '../../utils/theme';

type Props = NativeStackScreenProps<AgentStackParamList, 'PropertyTourRequests'>;

const PropertyTourRequestsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { propertyAddress, tourRequests } = route.params;

  const sorted = [...tourRequests].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  const renderItem = ({ item }: { item: TourRequest }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('TourRequestDetail', { tourRequest: item })}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{item.clientName}</Text>
          <Text style={styles.clientEmail}>{item.clientEmail || 'No email'}</Text>
          {item.clientPhone && (
            <Text style={styles.clientPhone}>{item.clientPhone}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
      </View>
      <View style={styles.cardFooter}>
        {item.source && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>
              {item.source === 'streeteasy' ? 'StreetEasy' : 'Zillow'}
            </Text>
          </View>
        )}
        <Text style={styles.date}>
          {new Date(item.receivedAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Ionicons name="home" size={22} color={colors.navy900} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.address}>{propertyAddress}</Text>
          <Text style={styles.count}>
            {sorted.length} {sorted.length === 1 ? 'request' : 'requests'}
          </Text>
        </View>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.gmailMessageId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy50,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    borderRadius: radii.lg,
  },
  address: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink900,
  },
  count: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  list: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.ink200,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink900,
  },
  clientEmail: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  clientPhone: {
    ...typography.caption,
    color: colors.ink600,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  sourceBadge: {
    backgroundColor: colors.ink50,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.ink600,
  },
  date: {
    ...typography.caption,
    color: colors.ink400,
  },
});

export default PropertyTourRequestsScreen;
