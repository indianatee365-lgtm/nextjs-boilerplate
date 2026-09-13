-- Incident log and loaner equipment inventory.
--
-- Facility Rules #5 asks customers to report pre-existing damage before a
-- session, and the Liability Waiver only allows a charge for damage caused by
-- "misuse or negligence". Neither clause is enforceable without a record of
-- what we own, what condition it was in, and what actually happened. These two
-- tables are that record.

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  name text not null,
  club_type text,
  hand text check (hand in ('right', 'left')),
  bay_id uuid references bays(id),
  status text not null default 'in_service'
    check (status in ('in_service', 'damaged', 'retired', 'missing')),
  replacement_cost numeric(10, 2),
  acquired_on date,
  baseline_photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column equipment.tag is 'Physical label on the grip or shaft, e.g. C-014. This is what a caller reads to the phone agent.';
comment on column equipment.baseline_photo_url is 'Condition photo taken when the item entered service. Without this, "report pre-existing damage" is unenforceable.';

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),

  -- When it happened, as distinct from when we heard about it. occurred_at is
  -- what the video scrub window is built from, so time_confidence matters:
  -- a caller saying "around seven" is not the same as a timestamped booking.
  occurred_at timestamptz,
  occurred_at_text text,
  time_confidence text not null default 'approximate'
    check (time_confidence in ('exact', 'approximate', 'unknown')),
  reported_at timestamptz not null default now(),
  reported_via text not null default 'admin'
    check (reported_via in ('admin', 'phone_agent', 'customer')),
  reporter_name text,
  reporter_phone text,

  category text not null default 'equipment_damage'
    check (category in ('equipment_damage', 'facility_damage', 'injury', 'conduct', 'other')),
  severity text not null default 'minor'
    check (severity in ('info', 'minor', 'major')),
  description text not null,

  bay_id uuid references bays(id),
  booking_id uuid references bookings(id),
  user_id uuid references profiles(id),
  equipment_id uuid references equipment(id),

  -- The waiver standard is misuse or negligence, not "it broke on your watch",
  -- so the default is pending until somebody actually decides.
  charge_decision text not null default 'pending'
    check (charge_decision in ('pending', 'no_charge', 'charged')),
  charge_amount numeric(10, 2),

  video_reviewed boolean not null default false,
  video_notes text,
  resolution_notes text,

  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidents_occurred_at_idx on incidents (occurred_at desc nulls last);
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_booking_id_idx on incidents (booking_id);
create index if not exists equipment_status_idx on equipment (status);

alter table equipment enable row level security;
alter table incidents enable row level security;

drop policy if exists "Admins can manage equipment" on equipment;
create policy "Admins can manage equipment" on equipment
  for all using (
    exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists "Admins can manage incidents" on incidents;
create policy "Admins can manage incidents" on incidents
  for all using (
    exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );
