CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,                          -- Expo push token (ExponentPushToken[xxx])
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,                             -- e.g., "iPhone 15 Pro" (optional, for debugging)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- Updated on each token refresh
  UNIQUE(user_id, token)
);

-- Indexes
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX idx_push_tokens_last_used ON push_tokens(last_used_at);

-- RLS: Users can manage their own tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_tokens" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);
