-- Fall league support: public signup page + weekly-billed league config.
-- The leagues / league_participants tables already existed but were unused
-- and had no fields for slugs, prize pool, teams, or signup state.

alter table leagues
  add column if not exists slug text,
  add column if not exists prize_pool_per_session numeric(10,2) not null default 0,
  add column if not exists signup_closes_on date;

create unique index if not exists leagues_slug_key
  on leagues (slug) where slug is not null;

comment on column leagues.day_of_week is '0 = Sunday, JS Date.getDay() convention';
comment on column leagues.price_per_session is 'Charged to each player per week, not per team.';
comment on column leagues.prize_pool_per_session is 'Portion of price_per_session that goes to the season prize pool.';

alter table league_participants
  add column if not exists partner_name text,
  add column if not exists preferred_slot time without time zone,
  add column if not exists status text not null default 'registered';

alter table league_participants
  drop constraint if exists league_participants_status_check;

alter table league_participants
  add constraint league_participants_status_check
  check (status in ('registered', 'waitlisted', 'withdrawn'));
