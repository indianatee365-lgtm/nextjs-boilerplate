-- Enable RLS on admin_logs to close Supabase security advisory.
-- No policies added: anon/authenticated clients cannot read or write.
-- service_role (server-side API routes) bypasses RLS and retains full access.
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
