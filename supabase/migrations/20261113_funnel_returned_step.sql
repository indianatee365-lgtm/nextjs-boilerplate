-- Booking funnel (2026-11-13): "returned" is a guest landing back on /book
-- after sign-in or sign-up with the time they picked, so /admin/funnel can
-- show how many of the people sent to sign in actually come back.
alter table booking_funnel_events drop constraint if exists booking_funnel_events_step_check;
alter table booking_funnel_events add constraint booking_funnel_events_step_check
  check (step in ('view', 'date', 'time', 'login', 'returned', 'reserved'));
