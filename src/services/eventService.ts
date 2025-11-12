/**
 * Event Service
 * Handles open house event CRUD operations
 */

import { supabase } from '../config/supabase';
import { OpenHouseEvent } from '../types';

interface CreateEventParams {
  propertyId: string;
  agentId: string;
  startTime: string;
  endTime: string;
}

export const eventService = {
  /**
   * Create a new open house event
   */
  async createEvent(params: CreateEventParams): Promise<OpenHouseEvent> {
    try {
      console.log('[createEvent] Creating event for agent:', params.agentId);
      
      // Determine initial status based on start time
      const now = new Date().toISOString();
      const initialStatus = params.startTime > now ? 'scheduled' : 'active';
      
      console.log('[createEvent] Event status:', initialStatus, 'Start:', params.startTime, 'Now:', now);
      
      const { data, error } = await supabase
        .from('open_house_events')
        .insert({
          property_id: params.propertyId,
          agent_id: params.agentId,
          start_time: params.startTime,
          end_time: params.endTime,
          status: initialStatus,
        })
        .select('*, property:properties(*)')
        .single();

      if (error) throw error;

      // Generate QR code data with event ID
      const qrData = `openhouse://join/${data.id}`;

      // Update event with QR code data
      const { data: updatedData, error: updateError } = await supabase
        .from('open_house_events')
        .update({ qr_code: qrData })
        .eq('id', data.id)
        .select('*, property:properties(*)')
        .single();

      if (updateError) throw updateError;

      console.log('[createEvent] Event created successfully:', updatedData.id);
      return updatedData as OpenHouseEvent;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  },

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<OpenHouseEvent | null> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('id', eventId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data as OpenHouseEvent | null;
    } catch (error) {
      console.error('Error fetching event:', error);
      throw error;
    }
  },

  /**
   * Get all events for an agent
   */
  async getAgentEvents(agentId: string): Promise<OpenHouseEvent[]> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('agent_id', agentId)
        .order('start_time', { ascending: false });

      if (error) throw error;

      return data as OpenHouseEvent[];
    } catch (error) {
      console.error('Error fetching agent events:', error);
      throw error;
    }
  },

  /**
   * Get active event for an agent
   */
  async getActiveEvent(agentId: string): Promise<OpenHouseEvent[]> {
    try {
      console.log('[getActiveEvent] Starting query for agent:', agentId);
      const startTime = Date.now();
      
      // Get ALL active events for the agent
      const queryPromise = supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('agent_id', agentId)
        .eq('status', 'active')
        .order('created_at', { ascending: false }); // Most recent first
      
      // Create a timeout promise (10 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Query timeout after 30 seconds'));
        }, 30000);
      });
      
      console.log('[getActiveEvent] Starting Promise.race...');
      
      // Race the query against the timeout
      const result = await Promise.race([
        queryPromise,
        timeoutPromise
      ]);
      
      console.log('[getActiveEvent] Promise.race resolved!');
      console.log('[getActiveEvent] Result:', JSON.stringify(result, null, 2));
      
      const { data, error } = result as any;
      
      const duration = Date.now() - startTime;
      console.log(`[getActiveEvent] Query completed in ${duration}ms`);
      
      // Handle errors
      if (error) {
        // PGRST116 means no rows found, which is fine - return empty array
        if (error.code === 'PGRST116') {
          console.log('[getActiveEvent] No active events found (PGRST116)');
          return [];
        }
        console.error('[getActiveEvent] Database error:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.log('[getActiveEvent] No active events found');
        return [];
      }
      
      console.log('[getActiveEvent] Found', data.length, 'active event(s)');
      return data as OpenHouseEvent[];
      
    } catch (error: any) {
      console.error('[getActiveEvent] Error:', error);
      
      if (error?.message?.includes('timeout')) {
        console.warn('[getActiveEvent] Query timed out, returning empty array');
        return [];
      }
      
      throw error;
    }
  },

  /**
   * Update event status
   */
  async updateEventStatus(
    eventId: string,
    status: OpenHouseEvent['status']
  ): Promise<OpenHouseEvent> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .update({ status })
        .eq('id', eventId)
        .select('*, property:properties(*)')
        .single();

      if (error) throw error;

      return data as OpenHouseEvent;
    } catch (error) {
      console.error('Error updating event status:', error);
      throw error;
    }
  },

  /**
   * Update event details
   */
  async updateEvent(
    eventId: string,
    updates: Partial<OpenHouseEvent>
  ): Promise<OpenHouseEvent> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .update(updates)
        .eq('id', eventId)
        .select('*, property:properties(*)')
        .single();

      if (error) throw error;

      return data as OpenHouseEvent;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  },

  /**
   * Delete event
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('open_house_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      console.log(`[deleteEvent] Event ${eventId} deleted successfully.`);
    } catch (error) {
      console.error('[deleteEvent] Error deleting event:', error);
      throw error;
    }
  },

  /**
   * Check and transition a single event's status based on time
   */
  async checkAndTransitionEventStatus(eventId: string): Promise<OpenHouseEvent> {
    try {
      const event = await this.getEvent(eventId);
      if (!event) throw new Error('Event not found');
      
      const now = new Date().toISOString();
      
      // Transition scheduled -> active
      if (event.status === 'scheduled' && event.start_time <= now) {
        console.log(`[checkAndTransitionEventStatus] Transitioning event ${eventId} from scheduled to active`);
        return await this.updateEventStatus(eventId, 'active');
      }
      
      // Transition active -> completed
      if (event.status === 'active' && event.end_time <= now) {
        console.log(`[checkAndTransitionEventStatus] Transitioning event ${eventId} from active to completed`);
        return await this.updateEventStatus(eventId, 'completed');
      }
      
      return event;
    } catch (error) {
      console.error('[checkAndTransitionEventStatus] Error:', error);
      throw error;
    }
  },

  /**
   * Check and transition all events for an agent
   */
  async checkAndTransitionAllAgentEvents(agentId: string): Promise<void> {
    try {
      const events = await this.getAgentEvents(agentId);
      const now = new Date().toISOString();
      
      console.log(`[checkAndTransitionAllAgentEvents] Checking ${events.length} events for agent ${agentId}`);
      
      for (const event of events) {
        // Transition scheduled -> active
        if (event.status === 'scheduled' && event.start_time <= now) {
          console.log(`[checkAndTransitionAllAgentEvents] Transitioning event ${event.id} from scheduled to active`);
          await this.updateEventStatus(event.id, 'active');
        } 
        // Transition active -> completed
        else if (event.status === 'active' && event.end_time <= now) {
          console.log(`[checkAndTransitionAllAgentEvents] Transitioning event ${event.id} from active to completed`);
          await this.updateEventStatus(event.id, 'completed');
        }
      }
    } catch (error) {
      console.error('[checkAndTransitionAllAgentEvents] Error:', error);
      throw error;
    }
  },

  /**
   * Get events categorized by status for an agent
   */
  async getEventsByAgent(agentId: string): Promise<{
    scheduled: OpenHouseEvent[];
    active: OpenHouseEvent[];
  }> {
    try {
      console.log('[getEventsByAgent] Fetching and categorizing events for agent:', agentId);
      
      // First, transition any events that need status changes
      await this.checkAndTransitionAllAgentEvents(agentId);
      
      // Fetch all non-completed events
      const { data, error } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('agent_id', agentId)
        .in('status', ['scheduled', 'active'])
        .order('start_time', { ascending: true });
      
      if (error) throw error;
      
      const events = data as OpenHouseEvent[];
      const now = new Date().toISOString();
      
      // Categorize events
      const scheduled = events.filter(e => e.status === 'scheduled' && e.start_time > now);
      const active = events.filter(e => e.status === 'active');
      
      console.log(`[getEventsByAgent] Found ${scheduled.length} scheduled, ${active.length} active events`);
      
      return { scheduled, active };
    } catch (error) {
      console.error('[getEventsByAgent] Error:', error);
      throw error;
    }
  },

  /**
   * Get completed events for an agent (for history)
   */
  async getCompletedEvents(agentId: string): Promise<OpenHouseEvent[]> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('agent_id', agentId)
        .eq('status', 'completed')
        .order('end_time', { ascending: false });
      
      if (error) throw error;
      
      console.log(`[getCompletedEvents] Found ${data?.length || 0} completed events`);
      return data as OpenHouseEvent[];
    } catch (error) {
      console.error('[getCompletedEvents] Error:', error);
      throw error;
    }
  },

  /**
   * Subscribe to event updates
   */
  subscribeToEvent(eventId: string, callback: (payload: any) => void) {
    return supabase
      .channel(`event:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'open_house_events',
          filter: `id=eq.${eventId}`,
        },
        callback
      )
      .subscribe();
  },
};

