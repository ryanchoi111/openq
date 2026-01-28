/**
 * Application Service
 * Handles sending housing applications to tenants via email using Resend API
 */

import { supabase } from '../config/supabase';
import { waitlistService } from './waitlistService';
import { emailTemplateService } from './emailTemplateService';

const RESEND_API_KEY = process.env.EXPO_PUBLIC_RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('[applicationService] RESEND_API_KEY not configured');
}

interface Recipient {
  email: string;
  name: string;
  entryId: string;
  phone?: string;
}

async function sendEmailViaResend(
  recipient: Recipient,
  emailContent: string,
  propertyAddress: string,
  agentEmail?: string
): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [recipient.email],
      reply_to: agentEmail || 'onboarding@resend.dev',
      subject: `Housing Application for ${propertyAddress}`,
      html: emailContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }
}

function buildEmailContent(
  emailBody: string,
  applicationUrl: string,
  agentEmail?: string
): string {
  const parts = [
    `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">`,
    emailBody.replace(/\n/g, '<br>'),
  ];

  if (applicationUrl) {
    parts.push(`<br><br><p><strong>Housing Application:</strong> <a href="${applicationUrl}" style="color: #2563eb; text-decoration: none;">Download PDF</a></p>`);
  }

  if (agentEmail) {
    parts.push(`<br><br><p style="font-size: 12px; color: #666;">Reply to: <a href="mailto:${agentEmail}" style="color: #2563eb;">${agentEmail}</a></p>`);
  }

  parts.push('</div>');
  return parts.join('');
}

async function gatherRecipients(entries: any[]): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  for (const entry of entries) {
    if (entry.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', entry.user_id)
        .single();

      if (user?.email) {
        recipients.push({
          email: user.email,
          name: user.name || 'User',
          phone: entry.guest_phone,
          entryId: entry.id,
        });
      }
    } else if (entry.guest_email) {
      recipients.push({
        email: entry.guest_email,
        name: entry.guest_name || 'Guest',
        phone: entry.guest_phone,
        entryId: entry.id,
      });
    }
  }

  if (recipients.length === 0) {
    throw new Error('No valid email addresses found');
  }

  return recipients;
}

export const applicationService = {
  /**
   * Send housing application to selected tenants
   * @param eventId - The open house event ID
   * @param entryIds - Array of waitlist entry IDs to send application to
   * @param applicationUrl - URL of the housing application document
   * @param agentId - The agent's user ID
   * @param agentName - The agent's name
   * @param agentEmail - The agent's email address (used as sender)
   */
  async sendApplicationToTenants(
    eventId: string,
    entryIds: string[],
    applicationUrl: string,
    agentId: string,
    agentName: string,
    agentEmail?: string
  ): Promise<void> {
    try {
      // Get all waitlist entries
      const entries = await waitlistService.getWaitlist(eventId);
      
      // Filter to only selected entries
      const selectedEntries = entries.filter((entry) => entryIds.includes(entry.id));
      
      if (selectedEntries.length === 0) {
        throw new Error('No valid recipients found');
      }

      // Get property and event details for the email
      const { data: event, error: eventError } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('id', eventId)
        .single();
      
      if (eventError) throw eventError;
      if (!event) throw new Error('Event not found');

      // Gather recipients with valid emails
      const recipients = await gatherRecipients(selectedEntries);

      // Load custom email template for this agent
      const emailTemplate = await emailTemplateService.getEmailTemplate(agentId);
      
      // Format property address for email
      const propertyAddress = emailTemplateService.formatPropertyAddress(event.property);
      
      // Insert application records
      const applicationRecords = recipients.map(recipient => ({
        event_id: eventId,
        waitlist_entry_id: recipient.entryId,
        property_id: event.property_id,
        recipient_email: recipient.email,
        recipient_phone: recipient.phone,
        application_url: applicationUrl,
        status: 'sent' as const,
      }));

      const { error: insertError } = await supabase
        .from('applications')
        .insert(applicationRecords);
      
      if (insertError) throw insertError;

      // Update waitlist entries to mark application as sent
      const { error: updateError } = await supabase
        .from('waitlist_entries')
        .update({ application_sent: true })
        .in('id', recipients.map(r => r.entryId));
      
      if (updateError) throw updateError;

      // Send emails to all recipients
      const emailResults = await Promise.allSettled(
        recipients.map(async (recipient) => {
          const personalizedBody = emailTemplateService.replaceTemplatePlaceholders(emailTemplate, {
            tenantName: recipient.name,
            propertyAddress,
            agentName,
          });

          const emailContent = buildEmailContent(personalizedBody, applicationUrl, agentEmail);
          await sendEmailViaResend(recipient, emailContent, propertyAddress, agentEmail);
        })
      );

      const failed = emailResults.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`Failed to send ${failed.length} of ${recipients.length} email(s)`);
      }
    } catch (error) {
      console.error('Error sending application:', error);
      throw error;
    }
  },

  /**
   * Get applications sent for a specific event
   */
  async getApplicationsByEvent(eventId: string) {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, waitlist_entry:waitlist_entries(*)')
        .eq('event_id', eventId)
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw error;
    }
  },

  /**
   * Get applications sent to a specific tenant
   */
  async getApplicationsByRecipient(email: string) {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*, event:open_house_events(*, property:properties(*))')
        .eq('recipient_email', email)
        .order('sent_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching recipient applications:', error);
      throw error;
    }
  },
};

