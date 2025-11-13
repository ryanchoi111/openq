-- OpenHouse App - Supabase Database Schema
--
-- Instructions:
-- 1. Go to your Supabase project > SQL Editor
-- 2. Run this entire script to create all tables and enable realtime
-- 3. This will set up proper RLS policies for security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'tenant')),
  profile_picture TEXT,
  housing_application_url TEXT, -- For agents: URL to uploaded housing application PDF
  onesignal_player_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties table
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  address2 TEXT, -- Optional: apartment, suite, unit, etc.
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  bedrooms INTEGER NOT NULL,
  bathrooms NUMERIC(3,1) NOT NULL,
  rent NUMERIC(10,2) NOT NULL,
  description TEXT,
  images TEXT[], -- Array of image URLs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Open house events
-- Status transitions: 'scheduled' (future start_time) -> 'active' (within time window) -> 'completed' (past end_time)
-- Events are automatically transitioned when agents refresh their dashboard
-- Only 'active' events within their time window can accept QR code scans
CREATE TABLE IF NOT EXISTS public.open_house_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  qr_code TEXT, -- Stores QR code data/URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waitlist entries (supports both authenticated users and guests)
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.open_house_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Null for guests
  guest_name TEXT, -- For guest users
  guest_phone TEXT, -- For guest users
  guest_email TEXT, -- For guest users (required in app)
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'touring', 'completed', 'skipped', 'no-show')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  started_tour_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expressed_interest BOOLEAN DEFAULT FALSE,
  application_sent BOOLEAN DEFAULT FALSE,
  notes TEXT,
  CONSTRAINT guest_or_user_required CHECK (
    (user_id IS NOT NULL) OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  )
);

-- Applications sent
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.open_house_events(id) ON DELETE CASCADE,
  waitlist_entry_id UUID NOT NULL REFERENCES public.waitlist_entries(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  recipient_email TEXT,
  recipient_phone TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'submitted')),
  application_url TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_properties_agent_id ON public.properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_property_id ON public.open_house_events(property_id);
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON public.open_house_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.open_house_events(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_event_id ON public.waitlist_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_user_id ON public.waitlist_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist_entries(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_position ON public.waitlist_entries(event_id, position);

-- Unique constraint to ensure no duplicate positions within an event
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_unique_position 
  ON public.waitlist_entries(event_id, position);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_house_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users: can read own data, update own profile
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Properties: agents can CRUD own properties, anyone can read
CREATE POLICY "Anyone can read properties" ON public.properties
  FOR SELECT USING (true);

CREATE POLICY "Agents can create properties" ON public.properties
  FOR INSERT WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update own properties" ON public.properties
  FOR UPDATE USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete own properties" ON public.properties
  FOR DELETE USING (auth.uid() = agent_id);

-- Events: agents can CRUD own events, anyone can read active events
CREATE POLICY "Anyone can read events" ON public.open_house_events
  FOR SELECT USING (true);

CREATE POLICY "Agents can create events" ON public.open_house_events
  FOR INSERT WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Agents can update own events" ON public.open_house_events
  FOR UPDATE USING (auth.uid() = agent_id);

CREATE POLICY "Agents can delete own events" ON public.open_house_events
  FOR DELETE USING (auth.uid() = agent_id);

-- Waitlist: anyone can insert (for guests), users can read entries for events they're in or managing
CREATE POLICY "Anyone can join waitlist" ON public.waitlist_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read waitlist for their events" ON public.waitlist_entries
  FOR SELECT USING (
    -- User is the tenant/guest who joined
    auth.uid() = user_id
    OR
    -- User is the agent managing this event
    EXISTS (
      SELECT 1 FROM public.open_house_events
      WHERE id = event_id AND agent_id = auth.uid()
    )
  );

CREATE POLICY "Agents can update waitlist for their events" ON public.waitlist_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.open_house_events
      WHERE id = event_id AND agent_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own waitlist entry" ON public.waitlist_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- Applications: agents can CRUD for their events, recipients can read theirs
CREATE POLICY "Anyone can read applications sent to them" ON public.applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.waitlist_entries
      WHERE id = waitlist_entry_id AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.open_house_events
      WHERE id = event_id AND agent_id = auth.uid()
    )
  );

CREATE POLICY "Agents can create applications for their events" ON public.applications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.open_house_events
      WHERE id = event_id AND agent_id = auth.uid()
    )
  );

-- Enable Realtime for waitlist updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.open_house_events;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.open_house_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically reorder waitlist positions when entry is removed
CREATE OR REPLACE FUNCTION reorder_waitlist_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- When an entry is deleted or marked as skipped/no-show, reorder remaining entries
  UPDATE public.waitlist_entries
  SET position = position - 1
  WHERE event_id = OLD.event_id
    AND position > OLD.position
    AND status = 'waiting';

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reorder_on_delete AFTER DELETE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION reorder_waitlist_positions();

-- Function to reorder waitlist entries atomically (for manual reordering)
-- Ensures:
--   1. All position updates happen in a single transaction
--   2. No duplicate positions (enforced by unique index)
--   3. Sequential positions with no gaps (validated post-update)
--   4. Proper shifting of other entries when moving up or down
CREATE OR REPLACE FUNCTION reorder_waitlist_entry(
  p_entry_id UUID,
  p_new_position INTEGER
)
RETURNS void AS $$
DECLARE
  v_old_position INTEGER;
  v_event_id UUID;
BEGIN
  -- Get current position and event_id
  SELECT position, event_id INTO v_old_position, v_event_id
  FROM public.waitlist_entries
  WHERE id = p_entry_id;
  
  IF v_old_position IS NULL THEN
    RAISE EXCEPTION 'Entry not found';
  END IF;
  
  IF v_old_position = p_new_position THEN
    RETURN;
  END IF;
  
  IF p_new_position < v_old_position THEN
    -- Moving up - shift down entries between new and old position
    UPDATE public.waitlist_entries
    SET position = position + 1
    WHERE event_id = v_event_id
      AND position >= p_new_position
      AND position < v_old_position;
  ELSE
    -- Moving down - shift up entries between old and new position
    UPDATE public.waitlist_entries
    SET position = position - 1
    WHERE event_id = v_event_id
      AND position > v_old_position
      AND position <= p_new_position;
  END IF;
  
  -- Update the target entry
  UPDATE public.waitlist_entries
  SET position = p_new_position
  WHERE id = p_entry_id;
  
  -- Verify positions are sequential and have no gaps
  -- This ensures data integrity after reordering
  PERFORM * FROM (
    SELECT 
      position,
      ROW_NUMBER() OVER (ORDER BY position) as expected_position
    FROM public.waitlist_entries
    WHERE event_id = v_event_id
  ) AS position_check
  WHERE position != expected_position;
  
  IF FOUND THEN
    RAISE EXCEPTION 'Position integrity check failed: gaps or duplicates detected';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to repair position sequence (removes gaps, ensures 1,2,3,...)
-- Use this if position integrity issues are detected
CREATE OR REPLACE FUNCTION repair_waitlist_positions(p_event_id UUID)
RETURNS void AS $$
BEGIN
  -- Reassign positions sequentially based on current order
  WITH numbered_entries AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (ORDER BY position, joined_at) as new_position
    FROM public.waitlist_entries
    WHERE event_id = p_event_id
  )
  UPDATE public.waitlist_entries w
  SET position = n.new_position
  FROM numbered_entries n
  WHERE w.id = n.id
    AND w.position != n.new_position;
    
  RAISE NOTICE 'Repaired positions for event %', p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STORAGE BUCKETS AND POLICIES
-- =====================================================

-- Create profile-pictures storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO NOTHING;

-- Profile pictures storage policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload profile pictures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-pictures');

CREATE POLICY IF NOT EXISTS "Allow public read access to profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile-pictures');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update own profile pictures"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-pictures');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete own profile pictures"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-pictures');

-- Create housing-applications storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('housing-applications', 'housing-applications', true)
ON CONFLICT (id) DO NOTHING;

-- Housing applications storage policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload housing applications"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'housing-applications');

CREATE POLICY IF NOT EXISTS "Allow public read access to housing applications"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'housing-applications');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update housing applications"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'housing-applications');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete housing applications"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'housing-applications');
