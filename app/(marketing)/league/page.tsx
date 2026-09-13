import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import LeagueSignupForm from "./LeagueSignupForm";

export const dynamic = "force-dynamic";

const LEAGUE_SLUG = "tuesday-night";

const DESCRIPTION =
  "An 8 week indoor golf league at Tee365 in Mishawaka. Two-person teams, 9 holes a week, net best ball. $30 a week, no season fee up front.";

export const metadata: Metadata = {
  title: "Tuesday Night Golf League | Tee365 Indoor Golf Simulator",
  description: DESCRIPTION,
  alternates: { canonical: "https://tee365.org/league" },
  openGraph: {
    type: "website",
    title: "Tuesday Night Golf League | Tee365 Indoor Golf Simulator",
    description: DESCRIPTION,
    url: "https://tee365.org/league",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tuesday Night Golf League | Tee365 Indoor Golf Simulator",
    description: DESCRIPTION,
    images: ["https://tee365.org/hero.jpg"],
  },
};

// Postgres hands back plain YYYY-MM-DD. new Date() would read that as UTC
// midnight and render a day early in Eastern, so build the date as local.
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function weeklyDates(startsOn: string, endsOn: string): Date[] {
  const out: Date[] = [];
  const end = parseLocalDate(endsOn);
  const cursor = parseLocalDate(startsOn);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const HOW_IT_WORKS = [
  {
    label: "Two-person teams",
    body: "Bring a partner or we will pair you with one. Two teams share a bay, four players total, so nobody is standing around waiting on a foursome.",
  },
  {
    label: "9 holes, net best ball",
    body: "Your team takes the better net score on each hole. One blown hole does not wreck your night, which matters when the field runs from scratch to 25 handicap.",
  },
  {
    label: "Handicaps after week two",
    body: "Weeks one and two everybody plays it straight. From week three on you get a handicap off your own scoring average, recalculated every week.",
  },
  {
    label: "Two tee times a night",
    body: "5:30pm and 7:30pm across all four bays. Pick the one you want at signup and keep it all season.",
  },
  {
    label: "Miss a week",
    body: "Play your round any other time that week at league rate, or take a blind draw score. Tell us before Tuesday and it is handled.",
  },
];

export default async function LeaguePage() {
  const service = await createServiceClient();

  const { data: league } = await service
    .from("leagues")
    .select("*")
    .eq("slug", LEAGUE_SLUG)
    .maybeSingle();

  if (!league) notFound();

  const { count } = await service
    .from("league_participants")
    .select("id", { count: "exact", head: true })
    .eq("league_id", league.id)
    .eq("status", "registered");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A league stays a draft until active is flipped on. Admins can preview it,
  // everyone else gets a 404 so an unfinished season never leaks.
  let isAdmin = false;
  if (user) {
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
  }

  if (!league.active && !isAdmin) notFound();

  let alreadyIn = false;
  if (user) {
    const { data: mine } = await service
      .from("league_participants")
      .select("id")
      .eq("league_id", league.id)
      .eq("user_id", user.id)
      .maybeSingle();
    alreadyIn = Boolean(mine);
  }

  const endsOn = league.ends_on ?? league.starts_on;
  const dates = weeklyDates(league.starts_on, endsOn);
  const weeks = dates.length;
  const maxPlayers = league.max_players ?? 32;
  const spotsLeft = Math.max(maxPlayers - (count ?? 0), 0);

  const perWeek = Number(league.price_per_session ?? 0);
  const potPerWeek = Number(league.prize_pool_per_session ?? 0);
  const bayPerWeek = perWeek - potPerWeek;
  const seasonTotal = perWeek * weeks;
  const totalPot = potPerWeek * maxPlayers * weeks;

  return (
    <main className="mx-auto max-w-3xl space-y-10 py-12">
      {!league.active && (
        <div className="mx-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 md:mx-12">
          Draft. Only admins can see this page. Set <code>active = true</code> on the league to
          publish it.
        </div>
      )}
      <header className="px-6 md:px-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">
          Fall {parseLocalDate(league.starts_on).getFullYear()} &middot; {weeks} weeks
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{league.name}</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-300">{league.description}</p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          No season fee to write a check for on day one. You pay {currency.format(perWeek)} a week,
          and {currency.format(bayPerWeek)} of that is your bay time. The other{" "}
          {currency.format(potPerWeek)} goes straight into the pot.
        </p>
      </header>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-[#00A651]/30 bg-[#00A651]/5 p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">The deal</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-white">
            {currency.format(perWeek)}
            <span className="text-lg font-normal text-neutral-400"> / week</span>
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            {currency.format(seasonTotal)} across the full season, billed weekly. Once week one tees
            off you are in for all {weeks} weeks.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Your cost</dt>
              <dd className="mt-1 font-semibold text-white">$12.50 / hr</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Booked solo</dt>
              <dd className="mt-1 font-semibold text-neutral-400 line-through">$45 / hr</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Season pot</dt>
              <dd className="mt-1 font-semibold text-white">{currency.format(totalPot)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-neutral-500">Spots left</dt>
              <dd className="mt-1 font-semibold text-white">
                {spotsLeft} of {maxPlayers}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="px-6 md:px-12 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          How it works
        </h2>
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {HOW_IT_WORKS.map(({ label, body }) => (
            <div key={label} className="space-y-2 p-6">
              <h3 className="text-sm font-semibold text-white">{label}</h3>
              <p className="text-sm leading-relaxed text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 md:px-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Schedule
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <ol className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {dates.map((d, i) => (
              <li key={d.toDateString()} className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-neutral-500">
                  Week {i + 1}
                </span>
                <span className="font-medium text-white">
                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-relaxed text-neutral-400">
            Signups close{" "}
            {league.signup_closes_on ? formatDate(league.signup_closes_on) : "when the league fills"}.
            Week one is {formatDate(league.starts_on)}, finale is {formatDate(endsOn)}.
          </p>
        </div>
      </section>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">
            Claim your spot
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
            {spotsLeft > 0 ? `${spotsLeft} spots left` : "The league is full"}
          </h2>
          <LeagueSignupForm
            leagueId={league.id}
            signedIn={Boolean(user)}
            alreadyIn={alreadyIn}
            full={spotsLeft <= 0}
          />
        </div>
      </section>

      <section className="px-6 md:px-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Good to know
        </h2>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-relaxed text-neutral-300">
          <p>
            <span className="font-semibold text-white">Skill level.</span> All of them. That is what
            the handicap is for. If you have never played a simulator before, week one is a fine
            place to start.
          </p>
          <p>
            <span className="font-semibold text-white">Clubs.</span> Bring your own or use our
            loaners. No rental fee.
          </p>
          <p>
            <span className="font-semibold text-white">Food and drinks.</span> We do not sell any,
            but you are welcome to bring your own. No glass, and no alcohol at Tee365. Zero
            tolerance, no exceptions.
          </p>
          <p>
            <span className="font-semibold text-white">Prizes.</span> The season pot pays out as
            Tee365 credit to the top finishers. There is also an optional $5 weekly skins and
            closest-to-the-pin game, paid out in full every week.
          </p>
          <p>
            <span className="font-semibold text-white">Questions.</span>{" "}
            <a href="tel:+15744449365" className="text-neutral-200 underline transition hover:text-white">
              (574) 444-9365
            </a>{" "}
            or{" "}
            <a href="mailto:info@tee365.org" className="text-neutral-200 underline transition hover:text-white">
              info@tee365.org
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
