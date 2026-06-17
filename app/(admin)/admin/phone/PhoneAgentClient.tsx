"use client"

import { useState, useEffect, useCallback } from "react"
import { Phone, ChevronDown, ChevronUp, Mic, Clock, PhoneOff, PhoneIncoming, Bot, Save, RotateCcw, CheckCircle, AlertCircle } from "lucide-react"

type CallLog = {
  id: string
  vapi_call_id: string | null
  caller_phone: string | null
  caller_name: string | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  ended_reason: string | null
  summary: string | null
  transcript: string | null
  recording_url: string | null
  created_at: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--"
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatTime(iso: string | null, timeZone = "America/Indiana/Indianapolis"): string {
  if (!iso) return "--"
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone,
  })
}

function endedReasonBadge(reason: string | null) {
  if (!reason) return null
  const map: Record<string, { label: string; cls: string }> = {
    "customer-ended-call":     { label: "Caller hung up",  cls: "bg-neutral-500/20 text-neutral-400" },
    "assistant-ended-call":    { label: "Agent ended",     cls: "bg-blue-500/20 text-blue-400" },
    "customer-did-not-answer": { label: "No answer",       cls: "bg-yellow-500/20 text-yellow-400" },
    "voicemail":               { label: "Voicemail",       cls: "bg-yellow-500/20 text-yellow-400" },
    "max-duration-exceeded":   { label: "Max duration",    cls: "bg-orange-500/20 text-orange-400" },
    "error":                   { label: "Error",           cls: "bg-red-500/20 text-red-400" },
  }
  const def = { label: reason.replace(/-/g, " "), cls: "bg-neutral-500/20 text-neutral-400" }
  const { label, cls } = map[reason] ?? def
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function CallRow({ call }: { call: CallLog }) {
  const [open, setOpen] = useState(false)
  const caller = call.caller_name ?? call.caller_phone ?? "Unknown caller"

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <Phone size={14} className="text-neutral-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{caller}</p>
          {call.caller_name && call.caller_phone && (
            <p className="text-xs text-neutral-500">{call.caller_phone}</p>
          )}
        </div>
        <div className="hidden sm:block text-xs text-neutral-400 w-32 text-right">
          {formatTime(call.started_at ?? call.created_at)}
        </div>
        <div className="w-24 text-right text-xs text-neutral-400">
          {formatDuration(call.duration_seconds)}
        </div>
        <div className="w-36 text-right hidden md:block">
          {endedReasonBadge(call.ended_reason)}
        </div>
        <div className="flex-shrink-0 text-neutral-600 ml-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {call.summary && (
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Summary</p>
              <p className="text-sm text-neutral-300">{call.summary}</p>
            </div>
          )}
          {call.transcript && (
            <div className="rounded-lg bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Transcript</p>
              <pre className="text-xs text-neutral-400 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                {call.transcript}
              </pre>
            </div>
          )}
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">Recording</p>
              <audio controls src={call.recording_url} className="w-full h-10" />
            </div>
          )}
          {!call.summary && !call.transcript && !call.recording_url && (
            <p className="text-xs text-neutral-600 italic">No transcript or summary available for this call.</p>
          )}
        </div>
      )}
    </div>
  )
}

function PromptEditor() {
  const [prompt, setPrompt] = useState("")
  const [savedPrompt, setSavedPrompt] = useState("")
  const [agentName, setAgentName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [unconfigured, setUnconfigured] = useState(false)

  const fetchPrompt = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/vapi-agent")
      if (res.status === 503) {
        setUnconfigured(true)
        return
      }
      const data = await res.json()
      if (data.error) { setErrorMsg(data.error); setStatus("error"); return }
      setPrompt(data.systemPrompt)
      setSavedPrompt(data.systemPrompt)
      setAgentName(data.agentName)
    } catch {
      setErrorMsg("Failed to load agent prompt")
      setStatus("error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPrompt() }, [fetchPrompt])

  async function handleSave() {
    setSaving(true)
    setStatus("idle")
    try {
      const res = await fetch("/api/admin/vapi-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: prompt }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "Save failed")
        setStatus("error")
      } else {
        setSavedPrompt(prompt)
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 3000)
      }
    } catch {
      setErrorMsg("Network error")
      setStatus("error")
    } finally {
      setSaving(false)
    }
  }

  const isDirty = prompt !== savedPrompt

  if (unconfigured) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={16} className="text-neutral-400" />
          <h2 className="text-sm font-semibold text-white">Agent Prompt</h2>
        </div>
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm text-yellow-400 font-medium mb-1">Not configured</p>
          <p className="text-xs text-neutral-400">
            Add <code className="bg-white/10 px-1 rounded">VAPI_API_KEY</code> and{" "}
            <code className="bg-white/10 px-1 rounded">VAPI_AGENT_ID</code> to Vercel environment variables to enable prompt editing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-neutral-400" />
          <h2 className="text-sm font-semibold text-white">
            Agent Prompt
            {agentName && <span className="ml-2 text-xs text-neutral-500 font-normal">{agentName}</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle size={12} /> Saved
            </span>
          )}
          {status === "error" && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle size={12} /> {errorMsg}
            </span>
          )}
          {isDirty && (
            <button
              onClick={() => setPrompt(savedPrompt)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <RotateCcw size={11} /> Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            <Save size={11} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 rounded-lg bg-white/5 border border-white/10 animate-pulse" />
      ) : (
        <>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={14}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-200 font-mono leading-relaxed placeholder-neutral-600 focus:border-white/30 focus:outline-none resize-y"
            placeholder="Enter the agent's system prompt..."
            spellCheck={false}
          />
          <div className="flex justify-between mt-2">
            <p className="text-xs text-neutral-600">
              Changes go live immediately after saving - no redeploy needed.
            </p>
            <p className="text-xs text-neutral-600">{prompt.length.toLocaleString()} chars</p>
          </div>
        </>
      )}
    </div>
  )
}

export default function PhoneAgentClient({
  calls,
  stats,
}: {
  calls: CallLog[]
  stats: {
    totalCalls: number
    callsThisWeek: number
    avgDurationSeconds: number
    missedCalls: number
  }
}) {
  const [search, setSearch] = useState("")

  const filtered = calls.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.caller_name ?? "").toLowerCase().includes(q) ||
      (c.caller_phone ?? "").includes(q) ||
      (c.summary ?? "").toLowerCase().includes(q) ||
      (c.transcript ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Phone size={20} className="text-neutral-400" />
        <h1 className="text-2xl font-semibold text-white">Phone Agent</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        <StatCard icon={<PhoneIncoming size={16} />} label="Total calls" value={String(stats.totalCalls)} />
        <StatCard icon={<Phone size={16} />} label="This week" value={String(stats.callsThisWeek)} />
        <StatCard icon={<Clock size={16} />} label="Avg duration" value={formatDuration(stats.avgDurationSeconds)} />
        <StatCard icon={<PhoneOff size={16} />} label="Missed / no answer" value={String(stats.missedCalls)} />
      </div>

      {/* Prompt editor */}
      <div className="mb-8">
        <PromptEditor />
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, number, or transcript..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-white/30 focus:outline-none"
        />
      </div>

      {/* Call log */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-white/10 text-xs text-neutral-600 uppercase tracking-widest">
          <div className="w-8" />
          <div className="flex-1">Caller</div>
          <div className="w-32 text-right">Time</div>
          <div className="w-24 text-right">Duration</div>
          <div className="w-36 text-right hidden md:block">Outcome</div>
          <div className="w-6" />
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Mic size={32} className="mx-auto mb-3 text-neutral-700" />
            <p className="text-sm text-neutral-500">
              {search ? "No calls match your search." : "No calls recorded yet."}
            </p>
            {!search && (
              <p className="text-xs text-neutral-600 mt-1">
                Calls will appear here after the phone agent handles them.
              </p>
            )}
          </div>
        ) : (
          filtered.map(call => <CallRow key={call.id} call={call} />)
        )}
      </div>

      {filtered.length > 0 && (
        <p className="mt-3 text-xs text-neutral-600 text-right">
          {filtered.length} call{filtered.length !== 1 ? "s" : ""}
          {search ? " matching" : ""}
        </p>
      )}
    </main>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-center gap-2 text-neutral-400">{icon}<span className="text-xs">{label}</span></div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}
