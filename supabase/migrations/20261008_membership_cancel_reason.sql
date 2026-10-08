-- Why members cancel (2026-10-08), asked optionally in the cancel box.
alter table public.memberships add column if not exists cancellation_reason text, add column if not exists cancellation_note text;
