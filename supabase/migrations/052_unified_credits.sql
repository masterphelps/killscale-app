-- Unified Credit System
-- Adds credit_cost and generation_label to track per-generation cost
-- Creates ai_credit_purchases table for one-time credit pack purchases

-- Add credit columns to existing usage tracking table
ALTER TABLE ai_generation_usage
  ADD COLUMN IF NOT EXISTS credit_cost INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS generation_label TEXT;

-- Backfill existing rows with 5 credits (image default)
UPDATE ai_generation_usage SET credit_cost = 5 WHERE credit_cost IS NULL;

-- Purchased credit packs (one-time Stripe purchases, don't roll over month to month)
CREATE TABLE IF NOT EXISTS ai_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_purchases_user
  ON ai_credit_purchases(user_id, created_at);

-- RLS: users can read own purchases, service role inserts
ALTER TABLE ai_credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own purchases" ON ai_credit_purchases;
CREATE POLICY "Users can read own purchases" ON ai_credit_purchases
  FOR SELECT USING (auth.uid() = user_id);
