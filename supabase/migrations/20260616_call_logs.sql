CREATE TABLE IF NOT EXISTS public.call_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id   TEXT UNIQUE,
  caller_phone   TEXT,
  caller_name    TEXT,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  duration_seconds INTEGER,
  ended_reason   TEXT,
  summary        TEXT,
  transcript     TEXT,
  recording_url  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_logs_created_at ON public.call_logs (created_at DESC);
CREATE INDEX idx_call_logs_caller_phone ON public.call_logs (caller_phone);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read call_logs"
  ON public.call_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "service role can insert call_logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (true);
