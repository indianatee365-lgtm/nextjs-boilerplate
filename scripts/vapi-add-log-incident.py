#!/usr/bin/env python3
"""Add the log_incident tool to the live Tee365 Vapi assistant.

Deploy the webhook handler BEFORE running this with --apply. The tool points at
https://tee365.org/api/voice/webhook, and if handleLogIncident is not deployed
there yet, a caller reporting damage gets "Tool not found".

    export VAPI_KEY=...          # projects/tee365/credentials.md
    python scripts/vapi-add-log-incident.py            # dry run
    python scripts/vapi-add-log-incident.py --apply    # patch it

Idempotent. Always writes a timestamped backup of the live assistant first.
"""

import datetime
import json
import os
import sys
import urllib.request

ASSISTANT = "da114320-1955-4539-8605-786e414cd7de"
WEBHOOK = "https://tee365.org/api/voice/webhook"
SP = os.path.dirname(os.path.abspath(__file__))
STAMP = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUP = os.path.join(SP, "vapi-assistant-backup-" + STAMP + ".json")
APPLY = "--apply" in sys.argv

KEY = os.environ.get("VAPI_KEY")
if not KEY:
    sys.exit("Set VAPI_KEY (see projects/tee365/credentials.md)")


def api(method, path, body=None):
    # Cloudflare 403s the default urllib User-Agent, so pin curl's.
    req = urllib.request.Request(
        "https://api.vapi.ai" + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
            "User-Agent": "curl/8.5.0",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


LOG_INCIDENT = {
    "type": "function",
    "server": {"url": WEBHOOK},
    "function": {
        "name": "log_incident",
        "description": (
            "Record damage, an injury, or a conduct problem at the facility. Use this whenever a "
            "caller reports that something BROKE, was DAMAGED, or that someone got HURT, including "
            "when they are reporting it about themselves. Do NOT use report_issue for these; "
            "report_issue is for equipment that is malfunctioning, like a flickering projector or "
            "a frozen screen."
        ),
        "parameters": {
            "type": "object",
            "required": ["description"],
            "properties": {
                "description": {
                    "type": "string",
                    "description": "What happened, in the caller's own words. Include what broke and how, if they said.",
                },
                "occurred_at": {
                    "type": "string",
                    "description": (
                        "When it happened, as an ISO 8601 local datetime like 2026-09-12T19:30. "
                        "Work this out from what the caller says plus the current date and time. "
                        "Omit only if they truly cannot say."
                    ),
                },
                "occurred_at_text": {
                    "type": "string",
                    "description": "The caller's own words about the time, e.g. 'around seven last night'.",
                },
                "time_confidence": {
                    "type": "string",
                    "enum": ["exact", "approximate"],
                    "description": "'exact' only if they gave a specific minute or said they checked a clock. Otherwise 'approximate'.",
                },
                "bay": {
                    "type": "string",
                    "description": "Which bay, if they know. Just the number is fine.",
                },
                "equipment_tag": {
                    "type": "string",
                    "description": "Tag printed on the club grip, e.g. C-014, if the caller can read it off.",
                },
                "category": {
                    "type": "string",
                    "enum": ["equipment_damage", "facility_damage", "injury", "conduct", "other"],
                    "description": "Default to equipment_damage for a broken club.",
                },
                "reporter_name": {
                    "type": "string",
                    "description": "The caller's name if they give it.",
                },
            },
        },
    },
}

PROMPT_SECTION = """

DAMAGE, INJURIES AND INCIDENTS
This is different from general feedback above. If a caller reports that something BROKE, was DAMAGED, or that someone got HURT, including when they are reporting it about themselves, use log_incident, not report_issue.

Gather, in this order:
1. What happened, in their own words.
2. WHAT TIME IT HAPPENED. Always ask this, even if they already gave you a rough idea. Ask it plainly and once: "So I can pull up the right camera footage, about what time did that happen?" If they genuinely do not know, log it without a time rather than pressing them.
3. Which bay, if they know.
4. If a club broke, ask whether they can read you the tag printed on the grip, something like C-014. Do not push if they cannot find it.

Turn the time they give you into an actual date and time using the current date and time, and pass it as occurred_at. Also pass their own words as occurred_at_text. Use time_confidence "exact" only if they gave a specific minute or said they checked a clock, otherwise "approximate".

Never suggest the caller will be charged for anything, and never speculate about whose fault it was. Thank them for telling us. Someone who calls in to report damage themselves is doing exactly what we want, and they should hang up feeling good about having called."""


def main():
    live = api("GET", "/assistant/" + ASSISTANT)
    with open(BACKUP, "w", encoding="utf-8") as f:
        json.dump(live, f)
    print("backed up live assistant to", os.path.basename(BACKUP))

    model = live["model"]
    tools = model["tools"]
    names = [(t.get("function") or {}).get("name") for t in tools]

    if "log_incident" in names:
        print("log_incident already on the assistant")
    else:
        tools.insert(names.index("report_issue") + 1, LOG_INCIDENT)
        print("inserted log_incident after report_issue")

    sys_msg = model["messages"][0]
    if "DAMAGE, INJURIES AND INCIDENTS" in sys_msg["content"]:
        print("prompt section already present")
    else:
        sys_msg["content"] = sys_msg["content"].rstrip() + PROMPT_SECTION
        print("appended prompt section")

    print("tools would be:", [(t.get("function") or {}).get("name") or t.get("type") for t in tools])

    if not APPLY:
        print("\nDry run. Re-run with --apply to PATCH the live assistant.")
        return

    res = api("PATCH", "/assistant/" + ASSISTANT, {"model": model})
    applied = [(t.get("function") or {}).get("name") or t.get("type") for t in res["model"]["tools"]]
    print("APPLIED. live tools:", applied)
    assert "log_incident" in applied, "log_incident missing after PATCH"


if __name__ == "__main__":
    main()
