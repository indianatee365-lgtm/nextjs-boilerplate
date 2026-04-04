import { Instagram, Facebook, Music2 } from "lucide-react"

export const metadata = {
  title: "Contact | Tee365",
  description: "Get in touch with Tee365 — indoor golf in South Bend, Indiana.",
}

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 py-12">
      <header className="px-6 md:px-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">We'd love to hear from you</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Get in Touch</h1>
      </header>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 space-y-8">

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#00A651] mb-3">Email</h2>
            <a
              href="mailto:info@tee365.org"
              className="text-sm text-neutral-300 transition hover:text-white"
            >
              info@tee365.org
            </a>
          </div>

          <div className="border-t border-white/10 pt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#00A651] mb-4">Follow Along</h2>
            <div className="flex flex-col gap-4">
              <a
                href="https://www.instagram.com/tee365.mishawaka"
                target="_blank"
                rel="nofollow noreferrer noopener"
                className="flex items-center gap-3 text-sm text-neutral-300 transition hover:text-white"
              >
                <Instagram size={16} />
                @tee365.mishawaka
              </a>
              <a
                href="https://www.facebook.com/people/Tee365/61578292102933/"
                target="_blank"
                rel="nofollow noreferrer noopener"
                className="flex items-center gap-3 text-sm text-neutral-300 transition hover:text-white"
              >
                <Facebook size={16} />
                Tee365 on Facebook
              </a>
              <a
                href="https://www.tiktok.com/@tee36568"
                target="_blank"
                rel="nofollow noreferrer noopener"
                className="flex items-center gap-3 text-sm text-neutral-300 transition hover:text-white"
              >
                <Music2 size={16} />
                @tee36568
              </a>
            </div>
          </div>

        </div>
      </section>
    </main>
  )
}
