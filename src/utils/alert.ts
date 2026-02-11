/**
 * Cross-platform Alert Utility
 * Works on both web and native
 */

import { Platform, Alert as RNAlert } from 'react-native';

export const Alert = {
  alert: (
    title: string,
    message?: string,
    buttons?: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>
  ) => {
    if (Platform.OS === 'web') {
      // Web implementation
      const fullMessage = message ? `${title}\n\n${message}` : title;

      if (!buttons || buttons.length === 0) {
        window.alert(fullMessage);
        return;
      }

      if (buttons.length === 1) {
        window.alert(fullMessage);
        buttons[0].onPress?.();
        return;
      }

      // For multiple buttons, use confirm
      const confirmed = window.confirm(fullMessage);

      // Find the non-cancel button (typically the action button)
      const actionButton = buttons.find(b => b.style !== 'cancel');
      const cancelButton = buttons.find(b => b.style === 'cancel');

      if (confirmed && actionButton) {
        actionButton.onPress?.();
      } else if (!confirmed && cancelButton) {
        cancelButton.onPress?.();
      }
    } else {
      // Native implementation
      RNAlert.alert(title, message, buttons);
    }
  },
};
