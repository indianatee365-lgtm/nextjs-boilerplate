-- Minutes added by an admin (free, from /admin/bays or Manage Bookings), so the
-- admin view can tell them apart from extensions the customer paid for.
-- extension_minutes stays the total; customer minutes = extension_minutes - admin_extension_minutes.
alter table public.bookings add column if not exists admin_extension_minutes integer not null default 0;
-- Backfill: admin extensions never add revenue, so an extended booking with no
-- extension revenue was extended by an admin. Paid rows are treated as all customer.
update public.bookings set admin_extension_minutes = extension_minutes
where coalesce(extension_minutes, 0) > 0 and coalesce(extension_revenue, 0) = 0;
