import Script from "next/script";

export default function FAQPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Where will Tee365 be located?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "South Bend, Indiana. Address will be updated as soon as possible.",
        },
      },
      {
        "@type": "Question",
        name: "When does Tee365 open?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Targeting fall of 2026. We’ll share a launch window after the lease is signed.",
        },
      },
      {
        "@type": "Question",
        name: "How does 24/7 access work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Book and pay online. Entry details will be sent via text message to your provided phone number 15 minutes before your tee time. Your rented bay will turn on and off automatically. If the bay is availabie, an option to extend your bay rental will be provided 15 minutes before the end of your current session.",
        },
      },
      {
        "@type": "Question",
        name: "Will there be staff at Tee365? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tee365 is designed to be a fully autonomous facility, reducing the need for staff. There will be resources available to help with any issue that could forseeably arise.",
        },
      },
      {
        "@type": "Question",
        name: " Do I bring my own golf clubs? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes you bring your own clubs. We expect that you leave the bay in the same condition you found it, so please clean your clubs and shoes prior to using the simulator bay.",
        },
      },
      {
        "@type": "Question",
        name: "Does Tee365 offer rental clubs? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We at Tee365 want to make golf as accessible as possible. While we do not aim to offer rental clubs, we look to offer a small selection of clubs for use by those that do not have clubs of their own, or do not have clubs with them.",
        },
      },
      {
        "@type": "Question",
        name: "Is there an age requirement? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Minimum age for public booking is 18. Exceptions will be made for members and high school partners.",
        },
      },
      {
        "@type": "Question",
        name: "How many players are allowed in each bay per booking? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "4 players per bay is the recommended maximum.",
        },
      },
      {
        "@type": "Question",
        name: "How long should I book a bay for? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "2 players can comfortably play nine holes per hour. Want to play 18 holes with 2 players? Book 2 hours. 18 holes with 4 players? Book 4 hours. Pro tip, If you want to increase your efficiency, book 2 bays for 2 hours and your amount of time waiting on your playing partners gets cut in half.",
        },
      },
      {
        "@type": "Question",
        name: "What happens if I have trouble with my bay? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "There is a basic troubleshooting guide in each bay, and if all else fails, call the number listed and we'll work to solve your issue.",
        },
      },
      {
        "@type": "Question",
        name: "Is there a dress code? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "While there is no specific dress code, please wear appropriate attire for public settings.",
        },
      },
      {
        "@type": "Question",
        name: "Is there food or beverage available? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "There is no food or beverage sold on site. You're welcome to bring your own food or beverage. No glass bottles are allowed.",
        },
      },
      {
        "@type": "Question",
        name: "Is alcohol allowed? ",
        acceptedAnswer: {
          "@type": "Answer",
          text: "There is NO ALCOHOL allowed on premises. There is a zero tolerance policy for consuming alcohol in Tee365.",
        },
      },
      {
        "@type": "Question",
        name: "Will you sell gift cards?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Gift cards will be available for a discounted rate for a limited time. Please stay tuned to our socials for an announcement on gift card availablity.",
        },
      },
    ],
  };

  return (
    <main className="mx-auto max-w-5xl space-y-10 py-12">
      <Script
        id="tee365-faq"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <header className="px-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">
          We’ll expand this section as get more frequently asked questions.
          Please reach out to our email or socials if you have any questions not
          listed.
        </p>
      </header>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">

          {[
            { q: "Where will Tee365 be located?", a: "South Bend, Indiana. Address will be updated as soon as possible." },
            { q: "When does Tee365 open?", a: "Targeting fall of 2026. We’ll share a launch window after the lease is signed." },
            { q: "How does 24/7 access work?", a: "Book and pay online. Entry details will be text to your provided phone number 15 minutes before your tee time. Your rented bay will turn on and off automatically. If the bay is available, an option to extend your bay rental will be provided 15 minutes before the end of your current session." },
            { q: "Will there be staff at Tee365?", a: "Tee365 is designed to be a fully autonomous facility, reducing the need for staff. There will be resources available to help with any issue that could foreseeably arise." },
            { q: "Do I bring my own golf clubs?", a: "Yes you bring your own clubs. We expect that you leave the bay in the same condition you found it, so please clean your clubs and shoes prior to using the simulator bay." },
            { q: "Does Tee365 offer rental clubs?", a: "We at Tee365 want to make golf as accessible as possible. While we do not aim to offer rental clubs, we look to offer a small selection of clubs for use by those that do not have clubs of their own, or do not have clubs with them." },
            { q: "Is there an age requirement?", a: "Minimum age for public booking is 18. Exceptions will be made for members and high school partners." },
            { q: "How many players are allowed in each bay per booking?", a: "4 players per bay is the recommended maximum." },
            { q: "How long should I book a bay for?", a: "2 players can comfortably play nine holes per hour. Want to play 18 holes with 2 players? Book 2 hours. 18 holes with 4 players? Book 4 hours. Pro tip: if you want to increase your efficiency, book 2 bays for 2 hours and your amount of time waiting on your playing partners gets cut in half." },
            { q: "What happens if I have trouble with my bay?", a: "There is a basic troubleshooting guide in each bay, and if all else fails, call the number listed and we’ll work to solve your issue." },
            { q: "Is there a dress code?", a: "While there is no specific dress code, please wear appropriate attire for public settings." },
            { q: "Is there food or beverage available?", a: "There is no food or beverage sold on site. You’re welcome to bring your own food or beverage. No glass bottles are allowed." },
            { q: "Is alcohol allowed?", a: "There is NO ALCOHOL allowed on premises. There is a zero tolerance policy for consuming alcohol in Tee365." },
            { q: "Will you sell gift cards?", a: "Yes. Gift cards will be available for a discounted rate for a limited time. Please stay tuned to our socials for an announcement on gift card availability." },
          ].map(({ q, a }, i) => (
            <div key={q} className="px-6 py-5" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
              <h2 className="text-sm font-semibold text-white">{q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-300">{a}</p>
            </div>
          ))}

        </div>
      </section>
    </main>
  );
}