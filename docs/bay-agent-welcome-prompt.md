# Bay welcome pop-up and corner QR (companion.py changes)

Status: website side built on branch `feat/bay-welcome-prompt`, not deployed.
The bay software (companion.py on each bay PC) is not in this repo, so its
side is written here as a spec. Nothing changes on a bay until both are deployed.

## Why

30 days to 2026-11-15, confirmed sessions already started:

- 90 sessions. 47 entered no names.
- 43 entered 2+ names, but only 17 ever had shots under 2+ names. In the other
  26 every shot went to one name.
- 3 bays were reset 1 to 6 minutes after names went in, with the game running
  and no ball hit yet (bookings 26d4ee71, 583268ea, ecd25ecd).

## What the website now sends (only to a bay that asks for it)

The bay opts in by adding `"capabilities": ["welcomePrompt"]` to the `status`
object it already posts to `/api/bay-agent/sync`. A bay that does not send it
gets exactly what it gets today (`showWhoIsUpPrompt`), so the website can go
live first with no change on the bays.

With the capability, an occupied response carries:

```json
"welcomePrompt": {
  "title": "Welcome to Tee365, Sam!",
  "line": "This bay is yours until 7:30 PM.",
  "controlText": "Control your session",
  "controlHint": "Tap the big screen to pick the range or a course.",
  "arrow": "left",
  "seconds": 20
},
"whoIsUpTab": {
  "label": "Playing with friends? Scan to track each player's shots",
  "url": "https://tee365.org/who-is-up/<booking>?token=<token>"
}
```

- `welcomePrompt` is present for the first 5 minutes of the booking (and during
  pre-warm). `arrow` is `left` on Bays 1 and 3, `right` on Bays 2 and 4.
- `whoIsUpTab` is present for the whole booking.
- `showWhoIsUpPrompt` is never sent to an opted-in bay.

## companion.py changes

1. Report the capability: add `capabilities: ["welcomePrompt"]` to the sync status.
2. Welcome pop-up, once per booking id:
   - Show `title` large, `line` under it.
   - Show `controlText` large with a big arrow (← for `left`, → for `right`)
     pointing at the projector, and `controlHint` small under it.
   - No QR code, no text field, no buttons except a close X.
   - Close on any tap or after `seconds`. Remember the booking id so it never
     reopens after a companion restart in the same booking.
   - Keep WS_EX_NOACTIVATE so it never steals focus from GSPro.
3. Corner tab instead of the old full-size "Who's playing?" pop-up:
   - Small, bottom-left of the PC monitor, QR of `url` plus `label`.
   - Never opens itself. A tap may enlarge the QR; it closes back to the tab.
   - Remove the on-screen name and email entry fields. Names are added on the
     phone only. (The `addPlayerName` sync path stays for older builds.)
   - Keep the "who's hitting" name buttons when `rosterNames` has 2+ names.
4. Restart button: before restarting, ask
   "Can you see the range or a course on the big screen? Then the bay is
   working, just hit a ball." with buttons "Keep playing" and "Restart anyway".

## Website changes on the branch

- `app/api/bay-agent/sync/route.ts`: capability check, `welcomePrompt`,
  `whoIsUpTab`, bay number in the bay read, and a new
  `booking-roster-kiosk-add` log when a name is typed on the bay PC.
- `app/(public)/who-is-up/[bookingId]/WhoIsUpFlow.tsx`: "Add names to see each
  player's shots. Skip it and every shot saves to you."; buttons "Save players"
  and "Skip, just me".
- `app/(public)/who-is-up/[bookingId]/WhoIsHittingFlow.tsx`: "Tap whoever is
  hitting next. Shots go to that person until you tap someone else."
- `app/guide/page.tsx`: "What's Who's Up?" now describes the corner QR.

## Deploy order (with Jerrod on site)

1. Merge the branch (website goes live; bays unchanged).
2. Update companion.py on one bay, run a test booking, check the pop-up,
   arrow direction, auto-close and corner tab. Build on top of the latest
   bay build (2026-11-27 or later) so its changes are kept: the idle
   projector bay-number flash from the sync response's `nearVisit`
   (2026-11-24), and the exit tip ring and restart logging (2026-11-27).
   The "Restart anyway" path in step 4 above must still send the GSPro
   screen and seconds since the last shot with the restart, as the
   2026-11-27 build does, so the restart log and text keep that detail.
3. Roll to the other bays.

## Not built: GSPro saved players

Customers who use GSPro's "Create New Player" leave permanent profiles that the
next customer sees. GSPro's own docs show no setting to lock the player list,
block new players or auto-remove them. Our website has no control inside GSPro.
Possible fix: companion.py, between sessions while GSPro is closed, backs up
GSPro's player data and removes any player not on a house list. Needs an
on-site look first at where GSPro keeps players (likely GSPro.db, the file the
agent already reads for club names) on one bay.
