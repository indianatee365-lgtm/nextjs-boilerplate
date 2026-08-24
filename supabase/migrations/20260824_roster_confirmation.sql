alter table bookings
  add column if not exists roster_confirmed_at timestamptz,
  add column if not exists roster_names text[];
