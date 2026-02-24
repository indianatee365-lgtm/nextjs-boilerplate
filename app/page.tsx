export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <section className="rounded-3xl border border-neutral-200 p-8">
        <p className="text-sm font-medium text-neutral-500">Coming soon</p>

        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Indoor golf that fits your schedule.
        </h1>

        <p className="mt-4 max-w-2xl text-lg text-neutral-700">
          Tee365 is launching 24/7 indoor golf simulators in the Mishawaka area.
          Location and launch window announced after lease signing.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <a
            href="#waitlist"
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Join the Founding List
          </a>

          <a
            href="#giftcards"
            className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 opacity-60"
            onClick={(e) => e.preventDefault()}
          >
            Gift cards (soon)
          </a>
        </div>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 p-6">
          <h2 className="text-xl font-semibold">Founding Members</h2>
          <ul className="mt-4 space-y-2 text-sm text-neutral-700">
            <li>Locked-in membership price for life</li>
            <li>Extra discount for the first 12 months</li>
            <li>Early booking access</li>
            <li>Invite-only soft opening</li>
            <li>Name on the founder wall</li>
          </ul>
        </div>

        <div
          id="waitlist"
          className="rounded-2xl border border-neutral-200 p-6"
        >
          <h2 className="text-xl font-semibold">Join the waitlist</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Two updates only: gift cards live and booking live.
          </p>

          <form
            className="mt-4 flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              alert("Connect this to Mailchimp or ConvertKit later.");
            }}
          >
            <input
              type="email"
              required
              placeholder="Email address"
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Join
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
