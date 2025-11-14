/**
 * Waitlist Service
 * Handles all waitlist operations including joining, managing queue, notifications
 */

import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      // First, validate event exists and is active within time window
      const { data: event, error: eventError } = await supabase
        .from('open_house_events')
        .select('status, start_time, end_time')
        .eq('id', eventId)
        .single();

      if (eventError) {
        console.error('Error fetching event for validation:', eventError);
        throw new Error('Event not found');
      }

      const now = new Date().toISOString();

      // Validate event status
      if (event.status !== 'active') {
        throw new Error('This open house is not currently active');
      }

      // Validate time window
      if (now < event.start_time) {
        throw new Error(`This open house hasn't started yet. It will begin at ${new Date(event.start_time).toLocaleString()}`);
      }

      if (now > event.end_time) {
        throw new Error('This open house event has already ended');
      }

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
            guest_email: user.email,
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

      // For guests, store the entry ID in AsyncStorage so they can view their history
      if (user.role === 'guest') {
        try {
          const key = `@guest_waitlist_history:${user.id}`;
          const existing = await AsyncStorage.getItem(key);
          const entries = existing ? JSON.parse(existing) : [];
          entries.push(data.id);
          await AsyncStorage.setItem(key, JSON.stringify(entries));
        } catch (storageError) {
          console.error('Error storing guest history:', storageError);
          // Don't throw - entry was created successfully
        }
      }

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
   * Get all waitlist entries for a specific user/tenant with event details
   */
  async getUserWaitlistHistory(userId: string, isGuest: boolean = false): Promise<any[]> {
    try {
      // For guests, retrieve entry IDs from AsyncStorage
      if (isGuest) {
        const key = `@guest_waitlist_history:${userId}`;
        const storedEntries = await AsyncStorage.getItem(key);
        
        if (!storedEntries) {
          console.log('[getUserWaitlistHistory] No stored entries for guest');
          return [];
        }

        const entryIds = JSON.parse(storedEntries);
        
        if (!entryIds || entryIds.length === 0) {
          console.log('[getUserWaitlistHistory] No entry IDs found for guest');
          return [];
        }

        // Fetch full entry details from database
        const { data, error } = await supabase
          .from('waitlist_entries')
          .select(`
            *,
            event:open_house_events (
              start_time,
              end_time,
              status,
              property:properties (
                address,
                address2,
                city,
                state,
                zip
              )
            )
          `)
          .in('id', entryIds)
          .order('joined_at', { ascending: false });

        if (error) {
          console.error('[getUserWaitlistHistory] Error fetching guest entries:', error);
          return [];
        }

        console.log(`[getUserWaitlistHistory] Found ${data?.length || 0} entries for guest`);
        return data || [];
      }

      // For authenticated users, query by user_id
      const { data, error } = await supabase
        .from('waitlist_entries')
        .select(`
          *,
          event:open_house_events (
            start_time,
            end_time,
            status,
            property:properties (
              address,
              address2,
              city,
              state,
              zip
            )
          )
        `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: false });

      // Handle errors - PGRST116 means no rows found, which is fine
      if (error) {
        if (error.code === 'PGRST116') {
          console.log('[getUserWaitlistHistory] No entries found for user');
          return [];
        }
        console.error('[getUserWaitlistHistory] Database error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log('[getUserWaitlistHistory] No waitlist entries found');
        return [];
      }

      console.log(`[getUserWaitlistHistory] Found ${data.length} entries`);
      return data;
    } catch (error) {
      console.error('[getUserWaitlistHistory] Error:', error);
      // Return empty array instead of throwing to prevent infinite loading
      return [];
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
   * Toggle interest in property (mark/unmark as interested)
   * Uses RPC function for guests to bypass RLS, direct update for authenticated users
   */
  async toggleInterest(entryId: string, interested: boolean): Promise<WaitlistEntry> {
    try {
      // Try to use the RPC function for guests first
      const { data, error } = await supabase
        .rpc('update_guest_interest', {
          p_entry_id: entryId,
          p_interested: interested,
        });

      if (error) {
        // If RPC fails (likely an authenticated user), try direct update
        const { data: directData, error: directError } = await supabase
          .from('waitlist_entries')
          .update({ expressed_interest: interested })
          .eq('id', entryId)
          .select()
          .single();
        
        if (directError) throw directError;
        return directData as WaitlistEntry;
      }

      return data as WaitlistEntry;
    } catch (error) {
      console.error('Error toggling interest:', error);
      throw error;
    }
  },

  /**
   * Reorder waitlist entries (for agent to move people up/down)
   * Uses PostgreSQL RPC for atomic position updates
   */
  async reorderEntry(entryId: string, newPosition: number): Promise<void> {
    try {
      const { error } = await supabase.rpc('reorder_waitlist_entry', {
        p_entry_id: entryId,
        p_new_position: newPosition,
      });

      if (error) throw error;
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
