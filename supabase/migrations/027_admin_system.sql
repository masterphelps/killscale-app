-- KillScale Admin System
-- Tables for admin dashboard, demo subscriptions, affiliates, and audit logging
-- These tables are accessed via service role key only (admin app)

-- 1. Admin users (who can access admin panel)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'support')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Admin-granted demo subscriptions (bypasses Stripe)
CREATE TABLE IF NOT EXISTS admin_granted_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('launch', 'scale', 'pro')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Affiliates
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  affiliate_code TEXT UNIQUE NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 20.00,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  payout_email TEXT,
  total_referrals INT DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0,
  pending_earnings DECIMAL(10,2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Affiliate referrals
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE NOT NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired')),
  conversion_date TIMESTAMPTZ,
  commission_amount DECIMAL(10,2),
  commission_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. User sessions (for "last login" tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_granted_subs_user_id ON admin_granted_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_granted_subs_active ON admin_granted_subscriptions(user_id, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_referred ON affiliate_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity_at DESC);

-- Enable RLS on all tables
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_granted_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Admin tables: No direct access via anon/authenticated roles
-- All access must go through service role (admin app)
-- We create restrictive policies that block everything for regular users

-- admin_users: Only service role can access
DROP POLICY IF EXISTS "No direct access to admin_users" ON admin_users;
CREATE POLICY "No direct access to admin_users"
  ON admin_users FOR ALL
  USING (false);

-- admin_granted_subscriptions: Users can view their own (to check their demo status)
DROP POLICY IF EXISTS "Users can view own granted subscriptions" ON admin_granted_subscriptions;
CREATE POLICY "Users can view own granted subscriptions"
  ON admin_granted_subscriptions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "No direct insert to admin_granted_subscriptions" ON admin_granted_subscriptions;
CREATE POLICY "No direct insert to admin_granted_subscriptions"
  ON admin_granted_subscriptions FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update to admin_granted_subscriptions" ON admin_granted_subscriptions;
CREATE POLICY "No direct update to admin_granted_subscriptions"
  ON admin_granted_subscriptions FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete from admin_granted_subscriptions" ON admin_granted_subscriptions;
CREATE POLICY "No direct delete from admin_granted_subscriptions"
  ON admin_granted_subscriptions FOR DELETE
  USING (false);

-- affiliates: Users can view their own affiliate record
DROP POLICY IF EXISTS "Users can view own affiliate record" ON affiliates;
CREATE POLICY "Users can view own affiliate record"
  ON affiliates FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can apply as affiliate" ON affiliates;
CREATE POLICY "Users can apply as affiliate"
  ON affiliates FOR INSERT
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "No direct update to affiliates" ON affiliates;
CREATE POLICY "No direct update to affiliates"
  ON affiliates FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete from affiliates" ON affiliates;
CREATE POLICY "No direct delete from affiliates"
  ON affiliates FOR DELETE
  USING (false);

-- affiliate_referrals: Affiliates can view their own referrals
DROP POLICY IF EXISTS "Affiliates can view own referrals" ON affiliate_referrals;
CREATE POLICY "Affiliates can view own referrals"
  ON affiliate_referrals FOR SELECT
  USING (affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "No direct insert to affiliate_referrals" ON affiliate_referrals;
CREATE POLICY "No direct insert to affiliate_referrals"
  ON affiliate_referrals FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update to affiliate_referrals" ON affiliate_referrals;
CREATE POLICY "No direct update to affiliate_referrals"
  ON affiliate_referrals FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete from affiliate_referrals" ON affiliate_referrals;
CREATE POLICY "No direct delete from affiliate_referrals"
  ON affiliate_referrals FOR DELETE
  USING (false);

-- admin_audit_log: No direct access
DROP POLICY IF EXISTS "No direct access to admin_audit_log" ON admin_audit_log;
CREATE POLICY "No direct access to admin_audit_log"
  ON admin_audit_log FOR ALL
  USING (false);

-- user_sessions: Users can view/update their own sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
CREATE POLICY "Users can view own sessions"
  ON user_sessions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own sessions" ON user_sessions;
CREATE POLICY "Users can insert own sessions"
  ON user_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own sessions" ON user_sessions;
CREATE POLICY "Users can update own sessions"
  ON user_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Function to generate unique affiliate code
CREATE OR REPLACE FUNCTION generate_affiliate_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-character uppercase alphanumeric code
    new_code := upper(substring(md5(random()::text) from 1 for 8));

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM affiliates WHERE affiliate_code = new_code) INTO code_exists;

    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
  END LOOP;

  NEW.affiliate_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate affiliate code on insert (if not provided)
DROP TRIGGER IF EXISTS trigger_generate_affiliate_code ON affiliates;
CREATE TRIGGER trigger_generate_affiliate_code
  BEFORE INSERT ON affiliates
  FOR EACH ROW
  WHEN (NEW.affiliate_code IS NULL OR NEW.affiliate_code = '')
  EXECUTE FUNCTION generate_affiliate_code();

-- Comment on tables for documentation
COMMENT ON TABLE admin_users IS 'Users with admin access to the admin dashboard';
COMMENT ON TABLE admin_granted_subscriptions IS 'Demo/trial subscriptions granted by admins (bypasses Stripe)';
COMMENT ON TABLE affiliates IS 'Affiliate program members';
COMMENT ON TABLE affiliate_referrals IS 'Referrals made by affiliates';
COMMENT ON TABLE admin_audit_log IS 'Audit log of all admin actions';
COMMENT ON TABLE user_sessions IS 'User login sessions for activity tracking';
