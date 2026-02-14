-- Add reach and frequency columns to ad_data for fatigue/burnout detection
-- reach = number of unique people who saw the ad (Meta returns as string integer)
-- frequency = average number of times each person saw the ad (Meta returns as decimal)
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0;
ALTER TABLE ad_data ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,4) DEFAULT 0;
