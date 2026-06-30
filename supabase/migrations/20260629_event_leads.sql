CREATE TABLE IF NOT EXISTS public.event_leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT,
  event_type   TEXT,
  event_date   TEXT,
  phone        TEXT,
  caller_phone TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_leads_created_at ON public.event_leads (created_at DESC);
CREATE INDEX idx_event_leads_phone ON public.event_leads (phone);

ALTER TABLE public.event_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read event_leads"
  ON public.event_leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "service role can insert event_leads"
  ON public.event_leads FOR INSERT
  WITH CHECK (true);
