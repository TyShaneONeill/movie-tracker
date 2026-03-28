CREATE TABLE push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,                          -- Token used for delivery
  ticket_id TEXT,                               -- Expo push ticket ID (for receipt lookup)
  feature TEXT NOT NULL,                        -- Source feature: 'release_reminder', 'social', 'digest', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,                                   -- Deep link URL + custom payload
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'invalid_token')),
  error_message TEXT,                           -- Error details if failed
  sent_at TIMESTAMPTZ,                          -- When Expo accepted the push
  receipt_checked_at TIMESTAMPTZ,               -- When we last checked the receipt
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_push_log_user_id ON push_notification_log(user_id);
CREATE INDEX idx_push_log_status ON push_notification_log(status)
  WHERE status IN ('pending', 'sent');
CREATE INDEX idx_push_log_feature ON push_notification_log(feature);
CREATE INDEX idx_push_log_created_at ON push_notification_log(created_at);

-- RLS: Users can read their own logs; service role writes
ALTER TABLE push_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_logs" ON push_notification_log
  FOR SELECT USING (auth.uid() = user_id);
