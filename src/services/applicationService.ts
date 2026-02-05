import { supabase } from '../config/supabase';
import { waitlistService } from './waitlistService';
import { emailTemplateService } from './emailTemplateService';

interface Recipient {
  email: string;
  name: string;
  entryId: string;
  emailBody: string;
}

async function gatherRecipients(
  entries: any[],
  emailTemplate: string,
  propertyAddress: string,
  agentName: string
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  for (const entry of entries) {
    let email: string | undefined;
    let name: string | undefined;

    if (entry.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', entry.user_id)
        .single();

      email = user?.email;
      name = user?.name || 'User';
    } else if (entry.guest_email) {
      email = entry.guest_email;
      name = entry.guest_name || 'Guest';
    }

    if (email) {
      const personalizedBody = emailTemplateService.replaceTemplatePlaceholders(emailTemplate, {
        tenantName: name || 'prospective tenant',
        propertyAddress,
        agentName,
      });

      recipients.push({
        email,
        name: name || 'Applicant',
        entryId: entry.id,
        emailBody: personalizedBody,
      });
    }
  }

  if (recipients.length === 0) {
    throw new Error('No valid email addresses found');
  }

  return recipients;
}

export const applicationService = {
  async sendApplicationToTenants(
    eventId: string,
    entryIds: string[],
    applicationUrl: string,
    agentId: string,
    agentName: string,
    agentEmail?: string
  ): Promise<void> {
    try {
      const entries = await waitlistService.getWaitlist(eventId);
      const selectedEntries = entries.filter((entry) => entryIds.includes(entry.id));

      if (selectedEntries.length === 0) {
        throw new Error('No valid recipients found');
      }

      const { data: event, error: eventError } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;
      if (!event) throw new Error('Event not found');

      const emailTemplate = await emailTemplateService.getEmailTemplate(agentId);
      const propertyAddress = emailTemplateService.formatPropertyAddress(event.property);
      const recipients = await gatherRecipients(
        selectedEntries,
        emailTemplate,
        propertyAddress,
        agentName
      );

      const { data, error } = await supabase.functions.invoke('send-application-email', {
        body: {
          eventId,
          propertyId: event.property_id,
          recipients,
          propertyAddress,
          applicationUrl,
          agentName,
          agentEmail,
        },
      });

      if (error) {
        console.error('Edge Function error:', error);
        throw new Error(`Failed to send emails: ${error.message}`);
      }

      if (!data.success) {
        const errorDetails = data.results
          ?.filter((r: any) => r.status === 'rejected' && r.error)
          .map((r: any) => `${r.recipient}: ${r.error}`)
          .join('; ');

        const errorMessage = data.error || errorDetails || `Failed to send ${data.failed} of ${recipients.length} email(s)`;
        throw new Error(errorMessage);
      }
    } catch (error) {
      throw error;
    }
  },

  async getApplicationsByEvent(eventId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('applications')
      .select('*, waitlist_entry:waitlist_entries(*)')
      .eq('event_id', eventId)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getApplicationsByRecipient(email: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('applications')
      .select('*, event:open_house_events(*, property:properties(*))')
      .eq('recipient_email', email)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
