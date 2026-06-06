import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Unsubscribed | Tee365",
  robots: { index: false },
}

export default function UnsubscribedPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-semibold tracking-widest uppercase text-brand mb-4">Tee365</p>
      <h1 className="text-2xl font-bold text-white mb-3">You're unsubscribed.</h1>
      <p className="text-neutral-400 text-sm mb-8">
        You won't receive marketing emails from us anymore. If you change your mind, you can always sign up again at{" "}
        <Link href="/" className="text-brand hover:underline">tee365.org</Link>.
      </p>
      <Link
        href="/"
        className="inline-block bg-brand text-black font-semibold text-sm px-6 py-3 rounded-lg hover:bg-brand/90 transition-colors"
      >
        Back to Tee365
      </Link>
    </main>
  )
}
