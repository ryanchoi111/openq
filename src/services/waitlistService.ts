/**
 * Waitlist Service
 * Handles all waitlist operations including joining, managing queue, notifications
 */

import { supabase } from '../config/supabase';
import { WaitlistEntry, GuestUser, User } from '../types';

interface JoinWaitlistParams {
  eventId: string;
  user: User | GuestUser;
}

export const waitlistService = {
  /**
   * Join waitlist for an open house event
   */
  async joinWaitlist({ eventId, user }: JoinWaitlistParams): Promise<WaitlistEntry> {
    try {
      // Get current max position for this event
      const { data: maxPosData, error: maxPosError } = await supabase
        .from('waitlist_entries')
        .select('position')
        .eq('event_id', eventId)
        .order('position', { ascending: false })
        .limit(1);

      if (maxPosError) throw maxPosError;

      const nextPosition = maxPosData && maxPosData.length > 0
        ? maxPosData[0].position + 1
        : 1;

      // Create waitlist entry
      const entry = user.role === 'guest'
        ? {
            event_id: eventId,
            guest_name: user.name,
            guest_phone: user.phone,
            position: nextPosition,
            status: 'waiting' as const,
          }
        : {
            event_id: eventId,
            user_id: user.id,
            position: nextPosition,
            status: 'waiting' as const,
          };

      const { data, error } = await supabase
        .from('waitlist_entries')
        .insert(entry)
        .select()
        .single();

      if (error) throw error;

      return data as WaitlistEntry;
    } catch (error) {
      console.error('Error joining waitlist:', error);
      throw error;
    }
  },

  /**
   * Get all waitlist entries for an event
   */
  async getWaitlist(eventId: string): Promise<WaitlistEntry[]> {
    try {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .eq('event_id', eventId)
        .order('position', { ascending: true });

      if (error) throw error;

      return data as WaitlistEntry[];
    } catch (error) {
      console.error('Error fetching waitlist:', error);
      throw error;
    }
  },

  /**
   * Update waitlist entry status
   */
  async updateEntryStatus(
    entryId: string,
    status: WaitlistEntry['status'],
    additionalData?: Partial<WaitlistEntry>
  ): Promise<WaitlistEntry> {
    try {
      const updateData: any = { status, ...additionalData };

      // Set timestamps based on status
      if (status === 'touring' && !additionalData?.started_tour_at) {
        updateData.started_tour_at = new Date().toISOString();
      } else if (status === 'completed' && !additionalData?.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('waitlist_entries')
        .update(updateData)
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;

      return data as WaitlistEntry;
    } catch (error) {
      console.error('Error updating entry status:', error);
      throw error;
    }
  },

  /**
   * Express interest in property
   */
  async expressInterest(entryId: string): Promise<WaitlistEntry> {
    try {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .update({ expressed_interest: true })
        .eq('id', entryId)
        .select()
        .single();

      if (error) throw error;

      return data as WaitlistEntry;
    } catch (error) {
      console.error('Error expressing interest:', error);
      throw error;
    }
  },

  /**
   * Reorder waitlist entries (for agent to move people up/down)
   */
  async reorderEntry(entryId: string, newPosition: number): Promise<void> {
    try {
      // Get the entry and event
      const { data: entry, error: fetchError } = await supabase
        .from('waitlist_entries')
        .select('event_id, position')
        .eq('id', entryId)
        .single();

      if (fetchError) throw fetchError;

      const oldPosition = entry.position;
      const eventId = entry.event_id;

      if (oldPosition === newPosition) return;

      // Update positions for affected entries
      if (newPosition < oldPosition) {
        // Moving up - shift down entries between new and old position
        await supabase
          .from('waitlist_entries')
          .update({ position: supabase.sql`position + 1` })
          .eq('event_id', eventId)
          .gte('position', newPosition)
          .lt('position', oldPosition);
      } else {
        // Moving down - shift up entries between old and new position
        await supabase
          .from('waitlist_entries')
          .update({ position: supabase.sql`position - 1` })
          .eq('event_id', eventId)
          .gt('position', oldPosition)
          .lte('position', newPosition);
      }

      // Update the target entry
      await supabase
        .from('waitlist_entries')
        .update({ position: newPosition })
        .eq('id', entryId);
    } catch (error) {
      console.error('Error reordering entry:', error);
      throw error;
    }
  },

  /**
   * Get waitlist entry for a specific user in an event
   */
  async getUserEntryForEvent(eventId: string, userId: string): Promise<WaitlistEntry | null> {
    try {
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

      return data as WaitlistEntry | null;
    } catch (error) {
      console.error('Error fetching user entry:', error);
      throw error;
    }
  },

  /**
   * Subscribe to realtime waitlist updates
   */
  subscribeToWaitlist(
    eventId: string,
    callback: (payload: any) => void
  ) {
    return supabase
      .channel(`waitlist:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'waitlist_entries',
          filter: `event_id=eq.${eventId}`,
        },
        callback
      )
      .subscribe();
  },
};
