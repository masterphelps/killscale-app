-- Migration: Add order_id to pixel_events for JOIN with shopify_orders
-- This enables the Northbeam/Triple Whale attribution model where:
-- - Shopify orders = revenue source of truth
-- - Pixel events = attribution source of truth
-- - JOIN on order_id = attributed revenue

-- Add order_id column for matching with shopify_orders
ALTER TABLE pixel_events
ADD COLUMN IF NOT EXISTS order_id TEXT;

-- Add order_total for validation/reconciliation
ALTER TABLE pixel_events
ADD COLUMN IF NOT EXISTS order_total DECIMAL(12,2);

-- Index for fast JOINs on order_id
CREATE INDEX IF NOT EXISTS idx_pixel_events_order_id
ON pixel_events(order_id) WHERE order_id IS NOT NULL;

-- Composite index for attribution queries
-- Used when joining pixel_events to shopify_orders
CREATE INDEX IF NOT EXISTS idx_pixel_events_attribution_join
ON pixel_events(pixel_id, order_id, utm_content)
WHERE event_type = 'purchase' AND order_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN pixel_events.order_id IS 'Shopify order ID (numeric only, e.g., 12345). Used to JOIN with shopify_orders for attribution.';
COMMENT ON COLUMN pixel_events.order_total IS 'Order total from pixel fire. Used for validation against webhook data.';
