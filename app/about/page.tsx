export const metadata = {
  title: "About | Tee365",
  description: "A note from Jerrod, founder of Tee365 — indoor golf in South Bend, Indiana.",
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 py-12">
      <header className="px-6 md:px-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">A note from the founder</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">About Tee365</h1>
      </header>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 space-y-5">

          <p className="text-sm leading-relaxed text-neutral-300">
            Not long ago, if you wanted to work on your swing in the middle of a Michiana winter, your closest option was 40 miles away. I know, because I was the guy making that drive.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            I'm a South Bend kid. Aside from my years in the Navy, which took me just about everywhere, I've spent my life in this city. I've seen the world, and I came back here. On purpose. I raised my family here. I love this town. I love this university. I believe in what this place is and what it's becoming.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            Tee365 was born out of a simple frustration: why should golfers in Michiana have to drive an hour and a half round trip just to hit a bucket of balls in February? They shouldn't. With courses closing, and ranges being sold off for other uses, places to get swings in, to practice, to play, are disappearing. So we're building the place I always wanted. Together.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            This isn't a bar with simulators in the back. There's nothing wrong with that, but that's not what this is. This is a place to actually work. To focus. To get better without an audience, without the noise, and without a bill that makes you wince on the way out the door. Nobody's gawking at you from a barstool here. You come in, you work (and play), you leave a better golfer than when you walked through the door.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            There's no corporate money behind this. No investors pushing me to squeeze every dollar out of every visit. Just a guy from here who wanted a place to practice his swing, couldn't find one, and decided to build it.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            And whether you're here to grind through a bucket's worth of balls working on your swing, or just show up with a few friends and have a great time, you'll fit right in. This place is for golfers at every level, and people who aren't sure they're golfers yet. Nobody's going to make you feel like you don't belong here. That's the whole point.
          </p>

          <p className="text-sm font-medium leading-relaxed text-white border-l-2 border-[#00A651] pl-4">
            Your game shouldn't be held hostage by the weather. It isn't at Tee365.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            Indiana winters are long. Rain happens. The sun sets earlier than you'd like, and summers here can be brutally hot. Real golf is at the mercy of all of it. Tee365 isn't. If it's a January blizzard or a July scorcher, neither factor into your tee time here, because:
          </p>

          <p className="text-center text-sm font-bold uppercase tracking-widest text-[#00A651]">
            It's Always 70° At Tee365
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            Whether you're a beginner just trying to hit the ball with some consistency, or a +2 handicapper prepping for your next tournament, we'll be here. We'll be open. 365 days a year.
          </p>

          <p className="text-sm leading-relaxed text-neutral-300">
            The doors aren't open yet, but they will be soon. You'll be among the first to know when we're ready. Your game has been waiting long enough.
          </p>

          <div className="pt-4 border-t border-white/10">
            <p className="text-sm font-semibold italic text-white">— Jerrod</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-[#00A651]">Founder, Tee365</p>
          </div>

        </div>
      </section>
    </main>
  )
}
