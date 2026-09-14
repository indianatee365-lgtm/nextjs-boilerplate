# Phone agent: log_incident tool

The handler (`handleLogIncident` in `app/api/voice/webhook/route.ts`) and the
Vapi tool definition have to ship together. The tool lives on the assistant in
Vapi, not in this repo, so the handler alone does nothing and the tool alone
returns "Tool not found" to a live caller.

**Order matters: deploy the handler first, then run the script.**

```bash
export VAPI_KEY=...            # projects/tee365/credentials.md
python scripts/vapi-add-log-incident.py            # dry run, changes nothing
python scripts/vapi-add-log-incident.py --apply    # patch the live assistant
```

The script replaces rather than skips, so editing `LOG_INCIDENT` or
`PROMPT_SECTION` inside it and re-running actually pushes the change. It always
writes a timestamped backup of the live assistant next to itself first; to roll
back, PATCH the assistant with the `model` object from that backup.

## Arguments

| Argument | Notes |
|---|---|
| `description` | required, the caller's own words |
| `occurred_at` | ISO local datetime, e.g. `2026-09-12T19:30` |
| `occurred_at_text` | what they actually said, e.g. "around seven last night" |
| `time_confidence` | `exact` or `approximate` |
| `bay` | digits or words, "bay three" and "bay 3" both parse |
| `club` | "7 iron", "driver" |
| `club_set` | "mens right handed", "kids left handed" |
| `category` | defaults to `equipment_damage` |
| `reporter_name` | optional |

## Why she asks for club and set, not a tag

The loaner clubs have no physical tags. Asking a caller to read an ID off the
grip sends them hunting for a label that does not exist and makes them feel
like they failed a test. Club plus set is something they can actually answer,
and "a seven iron from the mens right handed set" is enough to walk out and
find it.

`incidents.reported_club` and `reported_set` store their exact wording. The
handler will link the incident to a specific `equipment` row only when club and
set match exactly one in-service item, so a guess never gets recorded as fact.

Once the clubs are tagged, fill in `equipment.set_name` with the same phrasing
customers use and the two reconcile automatically.

## Why the time matters

`occurred_at` is the only input to the camera scrub window on
`/admin/incidents/[id]`. No time falls back to the whole booking. An approximate
time gives roughly 40 minutes. An exact time, clamped to bay power-on and
squeezed to the shot feed either side, is usually under 5.

The prompt tells her to ask once, warmly, and to log without a time rather than
press someone who genuinely does not remember.

## Gotchas found the hard way

- A caller saying "bay three" rather than "bay 3" used to drop the bay
  entirely, which silently killed the shot lookup, the booking match, and the
  camera window. Fixed in `9669efd`; `parseBayNumber` handles both.
- Facility wall times are resolved through an explicit zone offset, not
  `new Date()`, which would land an incident four or five hours off and send
  you scrubbing the wrong hour of footage.
