-- Two-bay booking changes (2026-11-20): reschedule payments for a group are
-- kept on the parent so later refunds can draw from every charge.
alter table bookings add column if not exists extra_charge_ids text[] not null default '{}';
