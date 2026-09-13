# Phone agent: log_incident tool

The handler (`handleLogIncident` in `app/api/voice/webhook/route.ts`) and the
Vapi tool definition have to ship together. The tool lives on the assistant in
Vapi, not in this repo, so the handler alone does nothing and the tool alone
returns "Tool not found" to a live caller.

**Order matters: deploy the handler first, then run the script below.**

## State as of 2026-09-13

- Handler: written, builds clean, **not deployed**.
- Vapi tool: written and verified against the live API (PATCH returned 200),
  then **deliberately reverted** because the handler was not deployed yet.
- One unrelated fix was kept live: the system prompt said "Jerpod" where it
  meant "Jerrod".

## Applying it

```bash
export VAPI_KEY=...            # projects/tee365/credentials.md
python scripts/vapi-add-log-incident.py --apply
```

The script is idempotent. Without `--apply` it builds and prints the payload
without sending anything. It always writes a timestamped backup of the current
assistant next to itself before patching.

To roll back, PATCH the assistant with the `model` object from that backup.

## What the tool sends

`log_incident` is synchronous (no `async` flag), matching `report_issue`, so
the agent speaks the handler's return string. Arguments:

| Argument | Notes |
|---|---|
| `description` | required, the caller's own words |
| `occurred_at` | ISO local datetime, e.g. `2026-09-12T19:30` |
| `occurred_at_text` | what they actually said, e.g. "around seven last night" |
| `time_confidence` | `exact` or `approximate` |
| `bay` | number is fine, "bay three" parses |
| `equipment_tag` | the tag on the grip, e.g. `C-014` |
| `category` | defaults to `equipment_damage` |
| `reporter_name` | optional |

## Why the agent always asks for the time

`occurred_at` is the only input to the camera scrub window on
`/admin/incidents/[id]`. No time means the window falls back to the whole
booking. An approximate time gives roughly 40 minutes. An exact time, clamped
to bay power-on and squeezed to the shot feed either side, is usually under 5.

The prompt tells her to ask once, warmly, and to log without a time rather than
press someone who genuinely does not remember.
