import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AgentStackParamList } from '../../navigation/types';
import type { TourRequest } from '../../types/gmail';
import type { AgentUser } from '../../types';
import { colors, typography, spacing, radii } from '../../utils/theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';

type Props = NativeStackScreenProps<AgentStackParamList, 'PropertyTourRequests'>;

const PropertyTourRequestsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { propertyAddress, tourRequests } = route.params;
  const { user } = useAuth();
  const agent = user as AgentUser;
  const calLink = agent?.cal_link || '';
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const sorted = [...tourRequests].sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );

  const selectableRequests = sorted.filter((r) => r.clientEmail);

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleLongPress = (item: TourRequest) => {
    if (!item.clientEmail) return;
    setSelectionMode(true);
    setSelectedIds(new Set([item.gmailMessageId]));
  };

  const handlePress = (item: TourRequest) => {
    if (selectionMode) {
      if (!item.clientEmail) return;
      toggleSelection(item.gmailMessageId);
    } else {
      navigation.navigate('TourRequestDetail', { tourRequest: item });
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRequests.map((r) => r.gmailMessageId)));
    }
  };

  const handleSendSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;

    Alert.alert(
      'Send Tour Link',
      `Send scheduling link to ${count} ${count === 1 ? 'person' : 'people'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: sendToSelected },
      ]
    );
  };

  const sendToSelected = async () => {
    setSending(true);
    const agentName = user?.name || 'Agent';
    const agentEmail = user?.email || '';
    let successCount = 0;
    let failCount = 0;

    const selected = sorted.filter((r) => selectedIds.has(r.gmailMessageId) && r.clientEmail);

    for (const req of selected) {
      const subject = `Tour Request: ${propertyAddress || 'Property'}`;
      let body = `Hi ${req.clientName},\n\nThank you for your interest in ${propertyAddress}!`;
      if (calLink) body += ` Book a tour using this link: ${calLink}`;
      body += `\n\nBest regards,\n${agentName}`;

      try {
        const { data, error } = await supabase.functions.invoke('send-tour-email', {
          body: { to: req.clientEmail, subject, emailBody: body, agentName, agentEmail },
        });
        if (error || (data && !data.success)) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    setSending(false);
    const msg = failCount > 0
      ? `Sent ${successCount}, failed ${failCount}`
      : `Sent to ${successCount} ${successCount === 1 ? 'contact' : 'contacts'}`;
    Alert.alert('Done', msg);
    exitSelectionMode();
  };

  const allSelected = selectableRequests.length > 0 && selectedIds.size === selectableRequests.length;

  const renderItem = ({ item }: { item: TourRequest }) => {
    const isSelected = selectedIds.has(item.gmailMessageId);
    const hasEmail = !!item.clientEmail;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          selectionMode && isSelected && styles.cardSelected,
          selectionMode && !hasEmail && styles.cardDisabled,
        ]}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{item.clientName}</Text>
            <Text style={styles.clientEmail}>{item.clientEmail || 'No email'}</Text>
            {item.clientPhone && (
              <Text style={styles.clientPhone}>{item.clientPhone}</Text>
            )}
          </View>
          {selectionMode && hasEmail ? (
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isSelected ? '#2563eb' : colors.ink400}
            />
          ) : (
            !selectionMode && <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
          )}
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
  };

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

      {selectionMode && (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={exitSelectionMode} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleSelectAll}>
            <Text style={styles.selectAllText}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.gmailMessageId}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          selectionMode && { paddingBottom: 100 },
        ]}
      />

      {selectionMode && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {selectedIds.size} {selectedIds.size === 1 ? 'person' : 'people'} selected
          </Text>
          <TouchableOpacity
            style={[styles.sendButton, (sending || selectedIds.size === 0) && styles.sendButtonDisabled]}
            onPress={handleSendSelected}
            disabled={sending || selectedIds.size === 0}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.sendButtonText}>
                  Send Tour Link ({selectedIds.size})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  cancelText: {
    fontSize: 15,
    color: colors.ink600,
    fontWeight: '500',
  },
  selectAllText: {
    fontSize: 15,
    color: '#2563eb',
    fontWeight: '600',
  },
  list: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.ink200,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  cardDisabled: {
    opacity: 0.4,
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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.ink200,
  },
  footerText: {
    fontSize: 14,
    color: colors.ink600,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#2563eb',
    padding: spacing.lg,
    borderRadius: radii.md,
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PropertyTourRequestsScreen;
