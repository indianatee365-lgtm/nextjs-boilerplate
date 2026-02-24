import Link from "next/link";

function Card({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-sm font-semibold text-white">{q}</p>
      <p className="mt-2 text-sm text-neutral-300">{a}</p>
    </div>
  );
}

export default function FAQPage() {
  return (
    <main className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Short answers now. Details later.
          </p>
        </div>

        <Link href="/" className="text-sm font-semibold text-neutral-300 hover:text-white transition">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card q="Where is Tee365?" a="Mishawaka area. Address coming soon." />
        <Card q="When do you open?" a="Targeting 2026. Opening window announced after lease signing." />
        <Card q="How does 24/7 work?" a="Online booking and entry instructions. Details soon." />
        <Card q="Can I buy gift cards?" a="Soon. Gift cards will be sold through Birrdi Golf." />
      </div>
    </main>
  );
}
