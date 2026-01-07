-- UpPromote Integration - Affiliate payout tracking for True ROAS calculation
-- Pattern: Follows Shopify integration (workspace-scoped, API key auth)

-- ============================================================================
-- TABLE: uppromote_connections
-- One UpPromote connection per workspace (like Shopify)
-- ============================================================================
CREATE TABLE IF NOT EXISTS uppromote_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- API credentials (Bearer token authentication)
  api_key TEXT NOT NULL,

  -- Optional: UpPromote shop identifier (may match Shopify domain)
  shop_domain TEXT,

  -- Sync metadata
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'error')),
  sync_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One UpPromote connection per workspace
  UNIQUE(workspace_id)
);

-- ============================================================================
-- TABLE: uppromote_referrals
-- Affiliate referral data from UpPromote API
-- JOIN with shopify_orders on order_id for per-ad commission attribution
-- ============================================================================
CREATE TABLE IF NOT EXISTS uppromote_referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- UpPromote identifiers
  uppromote_referral_id TEXT NOT NULL,  -- UpPromote's unique referral ID
  order_id TEXT,                         -- Shopify order ID (numeric, for JOIN with shopify_orders)
  order_number TEXT,                     -- Order display number (e.g., #1234)

  -- Financial data
  total_sales DECIMAL(12,2) NOT NULL DEFAULT 0,   -- Order total
  commission DECIMAL(12,2) NOT NULL DEFAULT 0,     -- Affiliate payout
  currency TEXT DEFAULT 'USD',

  -- Status tracking (only approved + paid count toward True ROAS)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'paid')),

  -- Affiliate info
  affiliate_id TEXT,
  affiliate_name TEXT,
  affiliate_email TEXT,

  -- Tracking metadata
  tracking_type TEXT,      -- e.g., "coupon", "link", "email"
  coupon_code TEXT,        -- Discount code used (if any)

  -- Timestamps from UpPromote
  referral_created_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Sync metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one referral per workspace
  UNIQUE(workspace_id, uppromote_referral_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Connection lookups
CREATE INDEX IF NOT EXISTS idx_uppromote_connections_workspace_id
  ON uppromote_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uppromote_connections_user_id
  ON uppromote_connections(user_id);

-- Referral lookups by workspace and date
CREATE INDEX IF NOT EXISTS idx_uppromote_referrals_workspace_id
  ON uppromote_referrals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uppromote_referrals_date
  ON uppromote_referrals(workspace_id, referral_created_at);

-- JOIN with shopify_orders on order_id
CREATE INDEX IF NOT EXISTS idx_uppromote_referrals_order_id
  ON uppromote_referrals(order_id) WHERE order_id IS NOT NULL;

-- Status-based queries (only count approved/paid commissions)
CREATE INDEX IF NOT EXISTS idx_uppromote_referrals_status
  ON uppromote_referrals(workspace_id, status);

-- Affiliate aggregation
CREATE INDEX IF NOT EXISTS idx_uppromote_referrals_affiliate
  ON uppromote_referrals(workspace_id, affiliate_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE uppromote_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE uppromote_referrals ENABLE ROW LEVEL SECURITY;

-- Connections: workspace-scoped access
DROP POLICY IF EXISTS "Users can view own uppromote connections" ON uppromote_connections;
CREATE POLICY "Users can view own uppromote connections"
  ON uppromote_connections FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own uppromote connections" ON uppromote_connections;
CREATE POLICY "Users can insert own uppromote connections"
  ON uppromote_connections FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own uppromote connections" ON uppromote_connections;
CREATE POLICY "Users can update own uppromote connections"
  ON uppromote_connections FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own uppromote connections" ON uppromote_connections;
CREATE POLICY "Users can delete own uppromote connections"
  ON uppromote_connections FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Referrals: workspace-scoped access
DROP POLICY IF EXISTS "Users can view own uppromote referrals" ON uppromote_referrals;
CREATE POLICY "Users can view own uppromote referrals"
  ON uppromote_referrals FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own uppromote referrals" ON uppromote_referrals;
CREATE POLICY "Users can insert own uppromote referrals"
  ON uppromote_referrals FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own uppromote referrals" ON uppromote_referrals;
CREATE POLICY "Users can update own uppromote referrals"
  ON uppromote_referrals FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete own uppromote referrals" ON uppromote_referrals;
CREATE POLICY "Users can delete own uppromote referrals"
  ON uppromote_referrals FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid()));

-- Service role full access (for sync operations)
DROP POLICY IF EXISTS "Service role full access uppromote_connections" ON uppromote_connections;
CREATE POLICY "Service role full access uppromote_connections"
  ON uppromote_connections FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access uppromote_referrals" ON uppromote_referrals;
CREATE POLICY "Service role full access uppromote_referrals"
  ON uppromote_referrals FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE uppromote_connections IS 'UpPromote affiliate platform connections. One per workspace.';
COMMENT ON TABLE uppromote_referrals IS 'Affiliate referrals synced from UpPromote. JOIN with shopify_orders on order_id.';
COMMENT ON COLUMN uppromote_referrals.order_id IS 'Shopify order ID (numeric). JOIN with shopify_orders.shopify_order_id for attribution.';
COMMENT ON COLUMN uppromote_referrals.commission IS 'Affiliate payout amount. Add to ad spend for True ROAS.';
COMMENT ON COLUMN uppromote_referrals.status IS 'Only approved + paid count toward True ROAS calculation.';
