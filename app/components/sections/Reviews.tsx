import Section from "../ui/Section";

// Real Google reviews, quoted word for word (trims marked with an ellipsis,
// meaning never changed). Plain text on purpose: no review/rating schema,
// Google ignores self-served stars for local businesses. The rating line is
// updated by hand (4.8 from 27 reviews as of 2026-11-15).
const GOOGLE_REVIEWS_URL = "https://www.google.com/search?kgmid=/g/11yfybc3fk";

const reviews = [
  { quote: "Clean facility, no issues getting started. Received my door code 15mins prior. … In the past at other indoor simulators I’ve experienced up to 30min delays with software issues that took away time. Not the case at Tee365.", name: "C. B." },
  { quote: "Was looking for a golf simulator facility with top of the line equipment, accessible with 24 hour access, and doesn't cost a fortune to book a session. Tee365 checks all of the boxes.", name: "Zach K." },
  { quote: "All 4 times that I have been there have been amazing. The owner is super friendly and goes the extra mile to make sure everything is running smoothly.", name: "Austin Q." },
  { quote: "What really impressed me was how easy everything was to set up. The instructions were clear, the process was simple, and we were up and playing in no time.", name: "Keith C." },
];

export default function Reviews() {
  return (
    <Section>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          What golfers say
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-300">
          <span className="font-semibold text-white">4.8 ★</span> on Google.{" "}
          <a
            href={GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
          >
            Read all our reviews
          </a>
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {reviews.map(({ quote, name }) => (
            <figure
              key={name}
              className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-7"
            >
              <p className="text-sm text-brand" aria-label="5 out of 5 stars">
                ★★★★★
              </p>
              <blockquote className="mt-3 text-base leading-7 text-white">
                &ldquo;{quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-xs uppercase tracking-wider text-neutral-400">
                {name} &middot; Google review
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}
