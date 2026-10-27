import Section from "../ui/Section";

// Real Google reviews, quoted word for word (trims marked with an ellipsis,
// meaning never changed). Plain text on purpose: no review/rating schema,
// Google ignores self-served stars for local businesses. The rating line is
// updated by hand (4.8 from 23 reviews as of 2026-10-27).
const GOOGLE_REVIEWS_URL = "https://www.google.com/search?kgmid=/g/11yfybc3fk";

const reviews = [
  { quote: "Best Sim in the area! I love coming here.", name: "Rick S." },
  { quote: "Awesome spot. Good sims. Dead simple to use. Super reasonably priced.", name: "Rob C." },
  { quote: "Awesome experience! Love that I can book a time anytime of day.", name: "Tyler T." },
  { quote: "Had a great time! … the owner gave me a call while we were there and we got it sorted out immediately!", name: "Nathan C." },
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
