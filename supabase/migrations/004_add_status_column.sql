-- Add status column to ad_data table
ALTER TABLE ad_data 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';

-- Add ad_id column if not exists
ALTER TABLE ad_data 
ADD COLUMN IF NOT EXISTS ad_id TEXT;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_ad_data_status ON ad_data(status);
