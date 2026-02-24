import Link from "next/link";

export default function FAQPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">FAQ</h1>
        <Link className="text-sm font-semibold text-neutral-900 hover:underline" href="/">
          Back to home
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 p-6">
          <p className="text-sm font-semibold">Where is Tee365?</p>
          <p className="mt-2 text-sm text-neutral-700">Mishawaka area. Address coming soon.</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-6">
          <p className="text-sm font-semibold">When do you open?</p>
          <p className="mt-2 text-sm text-neutral-700">Targeting 2026. Opening window announced after lease signing.</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-6">
          <p className="text-sm font-semibold">How does 24/7 work?</p>
          <p className="mt-2 text-sm text-neutral-700">Online booking and entry instructions. Details soon.</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-6">
          <p className="text-sm font-semibold">Can I buy gift cards?</p>
          <p className="mt-2 text-sm text-neutral-700">Soon. Gift cards will be sold through Birrdi Golf.</p>
        </div>
      </div>
    </main>
  );
}

