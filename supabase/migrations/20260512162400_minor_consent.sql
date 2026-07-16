ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_minor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parental_consent_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS parental_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_name text,
  parent_email text NOT NULL,
  token text UNIQUE NOT NULL,
  token_expires_at timestamptz NOT NULL,
  consented_at timestamptz,
  waiver_snapshot text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parental_consents ENABLE ROW LEVEL SECURITY;
