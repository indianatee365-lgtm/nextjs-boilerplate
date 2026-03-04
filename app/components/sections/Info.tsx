import { Instagram, Facebook, Music2, MapPin } from "lucide-react"

export default function Info() {
  return (
    <section
      id="info"
      className="relative overflow-hidden rounded-3xl border border-[color:var(--brandLine)] bg-white/5 p-8"
    >
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-40"
        style={{ backgroundColor: "var(--brandGlow)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-44 right-[-120px] h-[520px] w-[520px] rounded-full blur-3xl opacity-35"
        style={{ backgroundColor: "var(--brandSoft)" }}
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300"></p>

        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Indoor golf. 24/7. No hassle.
        </h2>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
          Tee365 is building a 24/7 indoor golf space designed for quick sessions,
          late-night practice, competition with your buddies, or in a league. Full
          details, Pricing, and Address will be posted as soon as possible.
        </p>

        {/* Founding + Waitlist (centered and mobile-safe) */}
        <div className="mx-auto mt-8 grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
          <div className="w-full rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Founding Members</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Limited enrollment when we announce the location.
            </p>

            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>
                - Locked-in membership price for LIFE (Maintaining Active Membership
                Required)
              </li>
              <li>- Extra discount for the first 12 months</li>
              <li>- Early booking access</li>
              <li>- Name on Founder&apos;s Wall</li>
            </ul>
          </div>

          <div
            id="waitlist"
            className="w-full rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
          >
            <h3 className="text-lg font-semibold text-white">Join Our Email List</h3>
            <p className="mt-2 text-sm text-neutral-300"></p>

            {/* Email input + button (stacks on mobile, row on larger screens) */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="email"
                placeholder="Email address"
                disabled
                className="w-full flex-1 rounded-xl border-2 border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-white/20 focus:ring-0"
              />
              <button
                type="button"
                disabled
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-neutral-300"
              >
                Join
              </button>
            </div>

            {/* Socials under the email row */}
            <div className="mt-5 border-t border-white/10 pt-4">
              <h3 className="mt-4 text-lg font-semibold text-white">
                Follow For Launch Updates
              </h3>

              <div className="mt-3 flex items-center gap-4">
                <a
                  href="https://www.instagram.com/tee365.mishawaka"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Tee365 on Instagram"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Instagram size={16} />
                </a>

                <a
                  href="https://www.facebook.com/people/Tee365/61578292102933/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Tee365 on Facebook"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Facebook size={16} />
                </a>

                <a
                  href="https://www.tiktok.com/@tee36568?_t=ZT-8ybYXacTg5X&_r=1"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Tee365 on TikTok"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <Music2 size={16} />
                </a>

                <a
                  href="https://share.google/d8bNieAsQUqaYomQZ"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Tee365 on Google Maps"
                  className="text-white/70 transition hover:text-white/90"
                >
                  <MapPin size={16} />
                </a>
              </div>
            </div>

            <p className="mt-2 text-xs text-neutral-400"></p>
          </div>
        </div>

        <div
          id="gift"
          className="mx-auto mt-8 w-full max-w-5xl rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold text-white">Gift cards</h3>
          <p className="mt-2 text-sm text-neutral-300">
            Gift cards will be sold at a discounted rate for a limited time. Keep
            track of our socials for updates.
          </p>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-300">
            Status: not live yet - check back soon
          </div>
        </div>
      </div>
    </section>
  )
}