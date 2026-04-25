import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PropertyLabel } from '../types/gmail';
import { colors, labelColor, spacing, radii, typography } from '../utils/theme';

interface Props {
  visible: boolean;
  propertyAddress: string;
  currentLabel: PropertyLabel;
  onSelect: (label: PropertyLabel) => void;
  onClose: () => void;
}

const OPTIONS: { value: PropertyLabel; text: string }[] = [
  { value: 'available', text: 'Available' },
  { value: 'processing', text: 'Processing' },
  { value: 'rented', text: 'Rented' },
  { value: 'none', text: 'None' },
];

export const PropertyLabelPicker: React.FC<Props> = ({
  visible,
  propertyAddress,
  currentLabel,
  onSelect,
  onClose,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback>
          <View style={styles.sheet}>
            <Text style={styles.title}>Label property</Text>
            <Text style={styles.address} numberOfLines={2}>{propertyAddress}</Text>

            {OPTIONS.map((opt) => {
              const selected = currentLabel === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={styles.row}
                  onPress={() => onSelect(opt.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.dot, { backgroundColor: labelColor(opt.value) }]} />
                  <Text style={styles.rowText}>{opt.text}</Text>
                  {selected && (
                    <Ionicons name="checkmark" size={20} color={colors.navy900} />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.ink900,
    marginBottom: spacing.xs,
  },
  address: {
    ...typography.caption,
    color: colors.ink600,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.ink200,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.md,
  },
  rowText: {
    ...typography.body,
    color: colors.ink900,
    flex: 1,
  },
  cancel: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.ink50,
    borderRadius: radii.md,
  },
  cancelText: {
    ...typography.subheading,
    color: colors.ink600,
  },
});
