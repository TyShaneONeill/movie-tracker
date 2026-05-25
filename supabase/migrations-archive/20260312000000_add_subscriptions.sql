-- Migration: Add subscriptions table and premium gating infrastructure
-- Date: 2026-03-12

-- 1. Rename 'premium' to 'plus' in profiles.account_tier
UPDATE profiles SET account_tier = 'plus' WHERE account_tier = 'premium';

-- 2. Create subscriptions table
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- RevenueCat identifiers
  revenuecat_customer_id text NOT NULL,
  entitlement_id text NOT NULL DEFAULT 'plus',

  -- Product info
  product_id text NOT NULL,
  store text NOT NULL,
  store_transaction_id text,

  -- Lifecycle
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  canceled_at timestamptz,
  grace_period_expires_at timestamptz,

  -- Trial
  is_trial boolean DEFAULT false,
  trial_start_at timestamptz,
  trial_end_at timestamptz,

  -- Metadata
  environment text DEFAULT 'production',
  raw_event jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, product_id, store_transaction_id)
);

-- 3. Indexes for common queries
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_revenuecat ON subscriptions(revenuecat_customer_id);

-- 4. RLS: users can read their own subscriptions, no user write access
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Grant service role full access (for edge functions / webhooks)
GRANT ALL ON subscriptions TO service_role;

-- 5. Function: sync_profile_tier()
-- Derives account_tier from active subscriptions. Protects dev accounts from downgrade.
CREATE OR REPLACE FUNCTION sync_profile_tier(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_tier text := 'free';
  v_expires timestamptz;
BEGIN
  -- Check for active 'plus' subscription
  SELECT 'plus', expires_at
  INTO v_tier, v_expires
  FROM subscriptions
  WHERE user_id = p_user_id
    AND entitlement_id = 'plus'
    AND status IN ('active', 'grace_period')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY expires_at DESC NULLS LAST
  LIMIT 1;

  -- Never downgrade dev accounts
  IF (SELECT account_tier FROM profiles WHERE id = p_user_id) = 'dev' THEN
    RETURN;
  END IF;

  UPDATE profiles
  SET account_tier = COALESCE(v_tier, 'free'),
      tier_expires_at = v_expires,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
