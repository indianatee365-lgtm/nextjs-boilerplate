-- Until the loaner clubs carry physical tags, a caller can only describe what
-- they broke. "A seven iron from the mens right handed set" is enough to walk
-- out and find it, and it is a far better question to ask on the phone than
-- reading a label that does not exist yet.

alter table incidents
  add column if not exists reported_club text,
  add column if not exists reported_set text;

comment on column incidents.reported_club is (
  'Club as the caller described it, e.g. "7 iron", "driver". Free text, not a lookup.');
comment on column incidents.reported_set is (
  'Which loaner set, as described, e.g. "mens right handed", "kids left handed".');

-- Group inventory the same way callers describe it, so these can be reconciled
-- once the clubs are tagged.
alter table equipment
  add column if not exists set_name text;

comment on column equipment.set_name is (
  'The set this club belongs to, phrased the way a customer would say it, e.g. "mens right handed".');
