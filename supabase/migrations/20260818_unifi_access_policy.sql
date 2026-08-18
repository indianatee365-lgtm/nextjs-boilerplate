-- Migration: track the per-booking Access Policy + Schedule created for door access
-- grantBayAccess() moved from the Visitor API to the User API + per-booking Access
-- Policy + Schedule on 2026-08-18: Visitor PINs never actually unlock the door
-- until someone manually clicks "Mark as Arrived" in the UniFi admin console (no
-- API for that - confirmed against live hardware and the official docs, which say
-- "Status change is not supported" for visitors). The User approach activates
-- immediately with no human in the loop.
--
-- unifi_visitor_id (added 2026-07-25) now stores the UniFi User id, not a Visitor id.
-- These two new columns are needed so revokeBayAccess() can clean up the Access
-- Policy and Schedule created alongside that User once the booking ends.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS unifi_access_policy_id TEXT,
  ADD COLUMN IF NOT EXISTS unifi_schedule_id TEXT;
