-- Phase 1: Add Business Type to Workspaces
-- Adds business_type column and CPR thresholds for lead-gen mode

-- Add business_type column to workspaces
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'ecommerce'
CHECK (business_type IN ('ecommerce', 'leadgen'));

-- Add index for queries
CREATE INDEX IF NOT EXISTS idx_workspaces_business_type ON workspaces(business_type);

-- Add CPR (Cost Per Result) thresholds to workspace_rules for lead-gen mode
ALTER TABLE workspace_rules
ADD COLUMN IF NOT EXISTS target_cpr DECIMAL(10,2) DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS max_cpr DECIMAL(10,2) DEFAULT 25.00;

COMMENT ON COLUMN workspaces.business_type IS 'Business model: ecommerce (ROAS metrics) or leadgen (CPR metrics)';
COMMENT ON COLUMN workspace_rules.target_cpr IS 'Target Cost Per Result for SCALE verdict in lead-gen mode';
COMMENT ON COLUMN workspace_rules.max_cpr IS 'Max Cost Per Result for WATCH verdict in lead-gen mode (above = KILL)';
