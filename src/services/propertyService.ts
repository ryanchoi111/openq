/**
 * Property Service
 * Handles property CRUD operations for agents
 */

import { supabase } from '../config/supabase';
import { Property } from '../types';

interface CreatePropertyParams {
  agentId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  rent: number;
  description?: string;
  images?: string[];
}

export const propertyService = {
  /**
   * Create a new property
   */
  async createProperty(params: CreatePropertyParams): Promise<Property> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .insert({
          agent_id: params.agentId,
          address: params.address,
          city: params.city,
          state: params.state,
          zip: params.zip,
          bedrooms: params.bedrooms,
          bathrooms: params.bathrooms,
          rent: params.rent,
          description: params.description,
          images: params.images,
        })
        .select()
        .single();

      if (error) throw error;

      return data as Property;
    } catch (error) {
      console.error('Error creating property:', error);
      throw error;
    }
  },

  /**
   * Get property by ID
   */
  async getProperty(propertyId: string): Promise<Property | null> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data as Property | null;
    } catch (error) {
      console.error('Error fetching property:', error);
      throw error;
    }
  },

  /**
   * Get all properties for an agent
   */
  async getAgentProperties(agentId: string): Promise<Property[]> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data as Property[];
    } catch (error) {
      console.error('Error fetching agent properties:', error);
      throw error;
    }
  },

  /**
   * Update property
   */
  async updateProperty(
    propertyId: string,
    updates: Partial<Property>
  ): Promise<Property> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', propertyId)
        .select()
        .single();

      if (error) throw error;

      return data as Property;
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  },

  /**
   * Delete property
   */
  async deleteProperty(propertyId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    }
  },

  /**
   * Search properties (for tenants)
   */
  async searchProperties(filters?: {
    city?: string;
    maxRent?: number;
    minBedrooms?: number;
  }): Promise<Property[]> {
    try {
      let query = supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }

      if (filters?.maxRent) {
        query = query.lte('rent', filters.maxRent);
      }

      if (filters?.minBedrooms) {
        query = query.gte('bedrooms', filters.minBedrooms);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data as Property[];
    } catch (error) {
      console.error('Error searching properties:', error);
      throw error;
    }
  },
};
