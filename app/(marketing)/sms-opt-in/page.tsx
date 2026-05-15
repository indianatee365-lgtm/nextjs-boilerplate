import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "SMS Opt-In Policy | Tee365",
  description: "How Tee365 collects SMS consent, what messages we send, and how to opt out.",
  alternates: { canonical: "https://tee365.org/sms-opt-in" },
}

export default function SmsOptInPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-white mb-2">SMS Opt-In Policy</h1>
      <p className="text-sm text-neutral-500 mb-10">Last updated: May 15, 2026</p>

      <div className="prose prose-invert prose-sm max-w-none space-y-8 text-neutral-300">

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. How We Collect Consent</h2>
          <p>
            When creating an account at{" "}
            <a href="https://tee365.org/signup" className="text-brand hover:underline">tee365.org/signup</a>,
            customers provide their phone number and may optionally check an SMS consent checkbox. Without
            SMS consent, access codes are available in the account dashboard and booking confirmations are
            sent by email.
          </p>
          <p className="mt-3">The optional checkbox reads verbatim:</p>
          <blockquote className="mt-3 border-l-4 border-brand/50 pl-4 py-2 bg-white/5 rounded-r-lg text-neutral-200 italic">
            "I agree to receive SMS messages from Tee365, including booking confirmations, access codes,
            and occasional promotions, sale alerts, and updates. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for info."
          </blockquote>
          <p className="mt-3">
            Consent status is recorded at the time of account creation and linked to the customer's phone number.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Program Description</h2>
          <p>
            <strong className="text-white">Business name:</strong> Tee365<br />
            <strong className="text-white">Business type:</strong> Indoor golf simulator facility<br />
            <strong className="text-white">Location:</strong> South Bend, Indiana<br />
            <strong className="text-white">SMS sender number:</strong> (574) 444-9365<br />
            <strong className="text-white">Message type:</strong> Transactional and marketing (booking confirmations, access codes, member deals &amp; promotions)
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Message Types &amp; Frequency</h2>
          <p>Tee365 sends two types of SMS messages:</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>
              <strong className="text-white">Booking confirmation</strong> — sent immediately after a booking is
              paid and confirmed. Contains bay number, session date/time, and a note that an access code will
              follow before the session.
            </li>
            <li>
              <strong className="text-white">Access code reminder</strong> — sent approximately 10–20 minutes
              before a booked session begins. Contains the unique numeric access code required to enter the facility.
            </li>
          </ul>
          <p className="mt-3">
            Message frequency depends on booking activity. Customers who book frequently will receive more messages;
            customers who do not book will receive few or none.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Sample Messages</h2>

          <p className="font-medium text-white mb-1">Booking Confirmation:</p>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
{`Hi [First Name]! Your Tee365 booking is confirmed.
📍 Bay [N]
🕐 [Day], [Month] [Date], [Time] – [End Time]
Your access code will be sent to this number 10–20 minutes before your session begins.
Questions? info@tee365.org
Reply STOP to opt out, HELP for info. Msg & data rates may apply.`}
          </div>

          <p className="font-medium text-white mb-1 mt-4">Access Code Reminder:</p>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap">
{`Tee365 reminder: [First Name], your session at Bay [N] starts at [Time].
🔐 Access code: [6-digit code]
Reply STOP to opt out.`}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Opt-Out Instructions</h2>
          <p>
            Customers can opt out of SMS messages at any time by replying <strong className="text-white">STOP</strong> to
            any message received from Tee365. Upon receipt of STOP, no further messages will be sent to that number.
          </p>
          <p className="mt-2">
            To re-subscribe, reply <strong className="text-white">START</strong> to the same number.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Help &amp; Support</h2>
          <p>
            Reply <strong className="text-white">HELP</strong> to any Tee365 SMS message for support information,
            or contact us directly at{" "}
            <a href="mailto:info@tee365.org" className="text-brand hover:underline">info@tee365.org</a>.
          </p>
          <p className="mt-2">
            Message and data rates may apply depending on your carrier and plan.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Privacy</h2>
          <p>
            Phone numbers collected for SMS communications are never sold or shared with third parties for marketing
            purposes. See our full{" "}
            <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a> for details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Contact</h2>
          <p>
            Tee365<br />
            South Bend, Indiana<br />
            <a href="mailto:info@tee365.org" className="text-brand hover:underline">info@tee365.org</a>
          </p>
        </section>

      </div>
    </main>
  )
}
