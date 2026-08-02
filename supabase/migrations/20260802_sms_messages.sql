-- Stores inbound and outbound SMS so the admin inbox can show a real
-- conversation thread per customer, not just fire-and-forget sends.
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,          -- the customer's number, normalized (+1...)
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  telnyx_message_id text,
  read_at timestamptz,                 -- null = unread/unhandled, set when an admin views it
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages (phone_number, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_unread ON sms_messages (read_at) WHERE read_at IS NULL;
