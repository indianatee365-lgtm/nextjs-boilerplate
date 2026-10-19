-- Thursday Night League: move start to Oct 29, 7 weeks, $20 ($16 bay / $4 pot).
-- Prepared 2026-10-19. NOT APPLIED. Run as one transaction.
-- Safe because: 0 charges, 0 matches, 0 league_nights rows exist for any week.
begin;

-- 1. The league itself.
update public.leagues set
  starts_on = '2026-10-29',
  ends_on = '2026-12-17',
  signup_closes_on = '2026-10-27',
  price_per_session = 20.00,
  prize_pool_per_session = 4.00,
  description = 'Two-person teams, everyone plays their own ball, A/B match play. 9 holes on a different course every week, Thursday nights at 5:30 or 7:30. Seven weeks, October 29 to December 17, no league on Thanksgiving.'
where slug = 'thursday-night';

-- 2. League nights. Drop the Oct 22 week, then renumber and reshape the rest:
--    weeks 1-2 learning, 3-6 match, 7 finale. Muirfield Village is the course cut.
delete from public.league_weeks where id = '50b5d4c8-7f18-41e1-8b41-45f96ddc0e16'; -- wk1 Oct 22
-- unique (league_id, week_no): park the numbers out of the way before renumbering.
update public.league_weeks set week_no = week_no + 100
where league_id = '04287887-e723-4d7a-9429-e4b6e993ae61';
update public.league_weeks w set week_no = v.no, kind = v.kind, course = v.course, nine = v.nine
from (values
  ('e340f00c-f1c5-4ab7-90bb-dcc476041a77'::uuid, 1, 'learning', 'Payne''s Valley',          'Front 9'), -- Oct 29
  ('5ac1693e-f657-45b7-ab18-f49ff4d1b148'::uuid, 2, 'learning', 'Mammoth Dunes',            'Front 9'), -- Nov 5
  ('4293897c-6f3e-424e-be58-26ab35f77a31'::uuid, 3, 'match',    'St Andrews (Old Course)',  'Front 9'), -- Nov 12
  ('09f4980f-c6e0-401e-acf8-b820042a5b17'::uuid, 4, 'match',    'Arcadia Bluffs',           'Front 9'), -- Nov 19
  ('3bebbd37-c9e4-463c-8b1a-0fda4bade627'::uuid, 5, 'match',    'Bandon Trails',            'Front 9'), -- Dec 3
  ('046fba56-dc65-4170-97b9-f7e6748fbe3e'::uuid, 6, 'match',    'Streamsong Blue',          'Back 9'),  -- Dec 10
  ('4c960998-4aac-47e3-b800-8b3f0fbae109'::uuid, 7, 'finale',   'Pebble Beach',             'Front 9')  -- Dec 17
) as v(id, no, kind, course, nine)
where w.id = v.id;

-- 3. Release the all-bay block on Thu Oct 22 so regular bookings can use it.
delete from public.blocked_times
where reason = 'Thursday Night League' and starts_at = '2026-10-22 21:00:00+00';

-- 4. Move the signup close-out text to Jerrod from Oct 21 to Oct 28, 8am ET.
select cron.alter_job(14, schedule := '0 12 28 10 *');

commit;
