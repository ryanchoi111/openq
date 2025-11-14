/**
 * Application Service
 * Handles sending housing applications to tenants via email
 * 
 * Note: This service requires a backend email service (e.g., SendGrid, Resend, or Supabase Edge Functions)
 * to actually send emails. For now, it provides the structure and can be extended with actual email sending logic.
 */

import { supabase } from '../config/supabase';
import { waitlistService } from './waitlistService';
import { emailTemplateService } from './emailTemplateService';

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

      // Prepare recipient data
      const recipients: Array<{
        email?: string;
        phone?: string;
        name: string;
        entryId: string;
      }> = [];

      for (const entry of selectedEntries) {
        let email: string | undefined;
        let name: string;

        if (entry.user_id) {
          // For authenticated users, fetch their email from the users table
          const { data: user, error: userError } = await supabase
            .from('users')
            .select('email, name')
            .eq('id', entry.user_id)
            .single();
          
          if (userError) {
            console.error(`Error fetching user ${entry.user_id}:`, userError);
            continue;
          }
          
          email = user?.email;
          name = user?.name || 'User';
        } else {
          // For guest users, use guest_email
          email = entry.guest_email;
          name = entry.guest_name || 'Guest';
        }

        if (email) {
          recipients.push({
            email,
            phone: entry.guest_phone,
            name,
            entryId: entry.id,
          });
        }
      }

      if (recipients.length === 0) {
        throw new Error('No valid email addresses found for selected recipients');
      }

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

      // Send actual emails via Edge Function
      try {
        // Prepare personalized emails for each recipient
        const emailsToSend = recipients.map(recipient => {
          // Replace placeholders with actual data for this recipient
          const personalizedEmailBody = emailTemplateService.replaceTemplatePlaceholders(emailTemplate, {
            tenantName: recipient.name,
            propertyAddress,
            agentName,
          });
          
          return {
            email: recipient.email!,
            name: recipient.name,
            emailBody: personalizedEmailBody,
          };
        });

        const { data, error: functionError } = await supabase.functions.invoke('send-application-email', {
          body: {
            recipients: emailsToSend,
            propertyAddress,
            applicationUrl,
            agentName,
            fromEmail: agentEmail,
          },
        });

        if (functionError) {
          console.error('Error calling email function:', functionError);
          // Don't throw - applications are recorded even if email fails
          throw new Error(`Emails failed to send: ${functionError.message}`);
        }

        console.log('Email sending result:', data);
        console.log(`Housing application sent to ${recipients.length} recipient(s)`);
      } catch (emailError) {
        console.error('Error sending emails:', emailError);
        // Applications are recorded, but email sending failed
        throw emailError;
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

