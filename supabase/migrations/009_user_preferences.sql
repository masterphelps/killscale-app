-- Migration 009: User Preferences & Profile Enhancement
-- Adds company field to profiles and creates user_preferences table

-- Add company column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company text;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  timezone text DEFAULT 'UTC',
  currency text DEFAULT 'USD',
  date_range_default integer DEFAULT 7,
  default_landing_page text DEFAULT 'dashboard' CHECK (default_landing_page IN ('dashboard', 'trends', 'alerts')),
  email_digest_enabled boolean DEFAULT true,
  alert_emails_enabled boolean DEFAULT true,
  marketing_emails_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Enable RLS
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
