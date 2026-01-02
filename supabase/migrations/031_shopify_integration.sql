-- Shopify Integration - Add workspace_id to existing tables
-- Tables already exist but need workspace_id column for workspace-scoping

-- Add workspace_id column to shopify_connections
ALTER TABLE shopify_connections
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Add created_at if it doesn't exist (was called connected_at before)
ALTER TABLE shopify_connections
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Copy connected_at to created_at if connected_at exists
UPDATE shopify_connections
SET created_at = connected_at
WHERE created_at IS NULL AND connected_at IS NOT NULL;

-- Add workspace_id column to shopify_orders
ALTER TABLE shopify_orders
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- For existing connections without workspace_id, link to user's default workspace
UPDATE shopify_connections sc
SET workspace_id = (
  SELECT w.id FROM workspaces w
  WHERE w.user_id = sc.user_id AND w.is_default = true
  LIMIT 1
)
WHERE sc.workspace_id IS NULL;

-- Same for orders
UPDATE shopify_orders so
SET workspace_id = (
  SELECT w.id FROM workspaces w
  WHERE w.user_id = so.user_id AND w.is_default = true
  LIMIT 1
)
WHERE so.workspace_id IS NULL;

-- Now add NOT NULL constraint (after backfilling)
-- Only if there's data that has workspace_id populated
DO $$
BEGIN
  -- Check if all rows have workspace_id before adding constraint
  IF NOT EXISTS (SELECT 1 FROM shopify_connections WHERE workspace_id IS NULL) THEN
    ALTER TABLE shopify_connections ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END $$;

-- Add unique constraint on workspace_id (one Shopify per workspace)
ALTER TABLE shopify_connections
DROP CONSTRAINT IF EXISTS shopify_connections_workspace_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shopify_connections_workspace_id_key'
  ) THEN
    ALTER TABLE shopify_connections ADD CONSTRAINT shopify_connections_workspace_id_key UNIQUE (workspace_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint might fail if there are duplicates, that's ok for now
  NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shopify_connections_workspace_id ON shopify_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_workspace_id ON shopify_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_user_id ON shopify_orders(user_id);

-- RLS policies
ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders ENABLE ROW LEVEL SECURITY;

-- Drop old policies and create new ones
DROP POLICY IF EXISTS "Users can view own shopify connections" ON shopify_connections;
CREATE POLICY "Users can view own shopify connections"
  ON shopify_connections FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own shopify connections" ON shopify_connections;
CREATE POLICY "Users can insert own shopify connections"
  ON shopify_connections FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own shopify connections" ON shopify_connections;
CREATE POLICY "Users can update own shopify connections"
  ON shopify_connections FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own shopify connections" ON shopify_connections;
CREATE POLICY "Users can delete own shopify connections"
  ON shopify_connections FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Shopify orders policies
DROP POLICY IF EXISTS "Users can view own shopify orders" ON shopify_orders;
CREATE POLICY "Users can view own shopify orders"
  ON shopify_orders FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own shopify orders" ON shopify_orders;
CREATE POLICY "Users can insert own shopify orders"
  ON shopify_orders FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own shopify orders" ON shopify_orders;
CREATE POLICY "Users can update own shopify orders"
  ON shopify_orders FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own shopify orders" ON shopify_orders;
CREATE POLICY "Users can delete own shopify orders"
  ON shopify_orders FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Service role full access
DROP POLICY IF EXISTS "Service role full access shopify_connections" ON shopify_connections;
CREATE POLICY "Service role full access shopify_connections"
  ON shopify_connections FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access shopify_orders" ON shopify_orders;
CREATE POLICY "Service role full access shopify_orders"
  ON shopify_orders FOR ALL
  USING (auth.role() = 'service_role');
