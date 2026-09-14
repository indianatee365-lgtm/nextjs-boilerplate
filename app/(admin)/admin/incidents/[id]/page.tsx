import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/admin/guard"
import { getIncidentContext, formatFacilityTime } from "@/lib/incidents"
import { updateIncident } from "../actions"

export const metadata = { title: "Incident | Tee365 Admin" }

const CATEGORY_LABEL: Record<string, string> = {
  equipment_damage: "Equipment damage",
  facility_damage: "Facility damage",
  injury: "Injury",
  conduct: "Conduct",
  other: "Other",
}

const CONFIDENCE_LABEL: Record<string, string> = {
  exact: "exact",
  approximate: "approximate",
  unknown: "unknown",
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-neutral-200">{children}</dd>
    </div>
  )
}

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { serviceClient } = await requireAdmin()

  const { data: incident } = await serviceClient
    .from("incidents")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (!incident) notFound();

  const ctx = await getIncidentContext(serviceClient, incident)

  const { data: item } = incident.equipment_id
    ? await serviceClient
        .from("equipment")
        .select("tag, name, replacement_cost, baseline_photo_url, status")
        .eq("id", incident.equipment_id)
        .maybeSingle()
    : { data: null }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/admin/incidents" className="text-sm text-neutral-500 transition-colors hover:text-white">
        &larr; Incidents
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-white">
        {CATEGORY_LABEL[incident.category]}
        {ctx.bayNumber ? ` in Bay ${ctx.bayNumber}` : ""}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-300">{incident.description}</p>

      <dl className="mt-6 grid grid-cols-2 gap-5 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-4">
        <Field label="Occurred">
          {incident.occurred_at ? formatFacilityTime(incident.occurred_at) : "Unknown"}
          <span className="ml-1 text-xs text-neutral-500">
            ({CONFIDENCE_LABEL[incident.time_confidence]})
          </span>
        </Field>
        <Field label="Reported">{formatFacilityTime(incident.reported_at)}</Field>
        <Field label="Via">{incident.reported_via.replace("_", " ")}</Field>
        <Field label="Severity">{incident.severity}</Field>
        {incident.occurred_at_text && (
          <Field label="Said as">&ldquo;{incident.occurred_at_text}&rdquo;</Field>
        )}
        {(incident.reported_club || incident.reported_set) && (
          <Field label="Club described">
            {incident.reported_club ?? "unspecified"}
            {incident.reported_set && (
              <span className="block text-xs text-neutral-500">{incident.reported_set} set</span>
            )}
          </Field>
        )}
        {incident.reporter_name && <Field label="Reporter">{incident.reporter_name}</Field>}
        {incident.reporter_phone && <Field label="Phone">{incident.reporter_phone}</Field>}
        {item && (
          <Field label="Item">
            <span className="font-mono">{item.tag}</span> {item.name}
            {item.replacement_cost && (
              <span className="block text-xs text-neutral-500">
                Replace ${Number(item.replacement_cost).toFixed(2)}
              </span>
            )}
          </Field>
        )}
      </dl>

      {/* Camera window. There is no video API here, so the job is to make the
          manual scrub as short as possible before anyone opens Protect. */}
      <section className="mt-6 rounded-xl border border-[#00A651]/30 bg-[#00A651]/5 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">
          Camera scrub window
        </h2>
        {ctx.window ? (
          <>
            <p className="mt-3 text-lg font-semibold tabular-nums text-white">
              {formatFacilityTime(ctx.window.start)}
              <span className="mx-2 text-neutral-500">to</span>
              {formatFacilityTime(ctx.window.end)}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {ctx.window.minutes} minute{ctx.window.minutes === 1 ? "" : "s"} of footage
              {ctx.bayNumber ? `, Bay ${ctx.bayNumber} camera` : ""}
            </p>
            <ol className="mt-4 space-y-1.5 border-t border-white/10 pt-4">
              {ctx.window.basis.map((line, i) => (
                <li key={i} className="flex gap-2 text-xs text-neutral-400">
                  <span className="text-neutral-600 tabular-nums">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            No time and no booking to work from, so there is no window to narrow. Add a time to the
            incident and this fills in.
          </p>
        )}

        {(ctx.lastShotBefore || ctx.firstShotAfter) && (
          <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Last shot before</p>
              {ctx.lastShotBefore ? (
                <p className="mt-1 text-sm text-neutral-200">
                  {formatFacilityTime(ctx.lastShotBefore.created_at)}
                  <span className="block text-xs text-neutral-400">
                    {[
                      ctx.lastShotBefore.club,
                      ctx.lastShotBefore.club_speed_mph ? `${ctx.lastShotBefore.club_speed_mph} mph club` : null,
                      ctx.lastShotBefore.hitter_name,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "no detail"}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">None tracked</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500">First shot after</p>
              {ctx.firstShotAfter ? (
                <p className="mt-1 text-sm text-neutral-200">
                  {formatFacilityTime(ctx.firstShotAfter.created_at)}
                  <span className="block text-xs text-neutral-400">
                    {ctx.shotGapMinutes !== null ? `${ctx.shotGapMinutes} min gap` : ""}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-neutral-500">
                  None after. Play may have stopped here.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {ctx.booking && (
        <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Session
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Field label="Booked">
              {formatFacilityTime(ctx.booking.starts_at)}
              <span className="block text-xs text-neutral-500">
                to {formatFacilityTime(ctx.booking.ends_at)}
              </span>
            </Field>
            <Field label="Bay on">
              {ctx.booking.bay_powered_on_at ? formatFacilityTime(ctx.booking.bay_powered_on_at) : "—"}
            </Field>
            <Field label="Bay off">
              {ctx.booking.bay_powered_off_at ? formatFacilityTime(ctx.booking.bay_powered_off_at) : "—"}
            </Field>
            <Field label="Roster">
              {ctx.booking.roster_names?.length ? ctx.booking.roster_names.join(", ") : "Not confirmed"}
            </Field>
          </dl>
        </section>
      )}

      <form
        action={updateIncident.bind(null, incident.id)}
        className="mt-6 grid gap-4 rounded-xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 sm:col-span-2">
          Decision
        </h2>
        <p className="-mt-2 text-xs leading-relaxed text-neutral-500 sm:col-span-2">
          The waiver only allows a charge for damage from misuse or negligence, and commits you to
          contact them first with 48 hours to respond. A club that failed on a normal swing is
          neither.
        </p>

        <label className="text-xs text-neutral-400">
          Charge decision
          <select
            name="charge_decision"
            defaultValue={incident.charge_decision}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="pending">Pending</option>
            <option value="no_charge">No charge</option>
            <option value="charged">Charged</option>
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Amount
          <input
            name="charge_amount"
            type="number"
            step="0.01"
            defaultValue={incident.charge_amount ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            name="video_reviewed"
            type="checkbox"
            defaultChecked={incident.video_reviewed}
            className="h-4 w-4 rounded border-white/20 bg-black/30"
          />
          Video reviewed
        </label>
        <label className="text-xs text-neutral-400">
          Status
          <select
            name="status"
            defaultValue={incident.status}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>

        <label className="text-xs text-neutral-400 sm:col-span-2">
          What the video showed
          <textarea
            name="video_notes"
            rows={2}
            defaultValue={incident.video_notes ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <label className="text-xs text-neutral-400 sm:col-span-2">
          Resolution
          <textarea
            name="resolution_notes"
            rows={2}
            defaultValue={incident.resolution_notes ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            Save
          </button>
        </div>
      </form>
    </main>
  )
}
