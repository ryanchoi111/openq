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
      // Generate QR code data (event ID will be used after creation)
      const { data, error } = await supabase
        .from('open_house_events')
        .insert({
          property_id: params.propertyId,
          agent_id: params.agentId,
          start_time: params.startTime,
          end_time: params.endTime,
          status: 'scheduled',
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
  async getActiveEvent(agentId: string): Promise<OpenHouseEvent | null> {
    try {
      const { data, error } = await supabase
        .from('open_house_events')
        .select('*, property:properties(*)')
        .eq('agent_id', agentId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data as OpenHouseEvent | null;
    } catch (error) {
      console.error('Error fetching active event:', error);
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
    } catch (error) {
      console.error('Error deleting event:', error);
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
