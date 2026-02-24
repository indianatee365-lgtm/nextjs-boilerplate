import Link from "next/link";

function Card({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
      <p className="text-sm font-semibold text-white">{q}</p>
      <p className="mt-2 text-sm text-neutral-300">{a}</p>
    </div>
  );
}

export default function FAQPage() {
  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Tee365
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            FAQ
          </h1>
          <p className="mt-2 text-sm text-neutral-300">
            Short answers now. Details later.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-[color:var(--brandLine)] bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition"
          >
            Home
          </Link>
          <a
            href="/#waitlist"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-black hover:brightness-95 transition"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Waitlist
          </a>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card q="Where is Tee365?" a="Mishawaka area. Address coming soon." />
        <Card q="When do you open?" a="Targeting 2026. Opening window announced after lease signing." />
        <Card q="How does 24/7 work?" a="Online booking and entry instructions. Details soon." />
        <Card q="Can I buy gift cards?" a="Soon. Gift cards will be sold through Birrdi Golf." />
        <Card q="Founding Members: what do I get?" a="Locked-in membership price for life, extra discount for 12 months, early booking access, soft opening invite, name on the founder wall." />
        <Card q="How will I join?" a="We’ll open enrollment after the location announcement. Join the waitlist to get first access." />
      </div>
    </main>
  );
}
