/**
 * Email Template Service
 * Manages custom email templates for housing application distribution
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const EMAIL_TEMPLATE_KEY_PREFIX = '@openhouse:email_template_';

const DEFAULT_TEMPLATE = `Hello {$NAME_OF_TENANT},

Thank you for your interest in {$ADDRESS_OF_INTERESTED_HOUSE}! In the attached, I have added the housing application for it.



Sincerely,

{$NAME_OF_AGENT}`;

export interface TemplateData {
  tenantName: string;
  propertyAddress: string;
  agentName: string;
}

export const emailTemplateService = {
  /**
   * Get email template for a specific agent
   * Returns default template if none exists
   */
  async getEmailTemplate(agentId: string): Promise<string> {
    try {
      const key = `${EMAIL_TEMPLATE_KEY_PREFIX}${agentId}`;
      const template = await AsyncStorage.getItem(key);
      return template || DEFAULT_TEMPLATE;
    } catch (error) {
      console.error('Error getting email template:', error);
      return DEFAULT_TEMPLATE;
    }
  },

  /**
   * Save email template for a specific agent
   */
  async saveEmailTemplate(agentId: string, template: string): Promise<void> {
    try {
      // Validate character limit
      if (template.length > 2000) {
        throw new Error('Template exceeds 2000 character limit');
      }

      const key = `${EMAIL_TEMPLATE_KEY_PREFIX}${agentId}`;
      await AsyncStorage.setItem(key, template);
    } catch (error) {
      console.error('Error saving email template:', error);
      throw error;
    }
  },

  /**
   * Get the default email template
   */
  getDefaultTemplate(): string {
    return DEFAULT_TEMPLATE;
  },

  /**
   * Replace template placeholders with actual data
   * Uses split/join instead of replace() to prevent regex injection
   */
  replaceTemplatePlaceholders(template: string, data: TemplateData): string {
    let result = template;
    result = result.split('{$NAME_OF_TENANT}').join(data.tenantName);
    result = result.split('{$ADDRESS_OF_INTERESTED_HOUSE}').join(data.propertyAddress);
    result = result.split('{$NAME_OF_AGENT}').join(data.agentName);
    return result;
  },

  /**
   * Format property address for email
   */
  formatPropertyAddress(property: {
    address: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
  }): string {
    const parts = [property.address];
    
    if (property.address2) {
      parts.push(property.address2);
    }
    
    parts.push(`${property.city}, ${property.state} ${property.zip}`);
    
    return parts.join(', ');
  },
};

