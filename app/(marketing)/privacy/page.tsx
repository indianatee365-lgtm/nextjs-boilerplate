import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy | Tee365",
  description: "Privacy policy for Tee365: how we collect, use, and protect your information.",
  alternates: { canonical: "https://tee365.org/privacy" },
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-neutral-500 mb-10">Last updated: November 9, 2026</p>

      <div className="prose prose-invert prose-sm max-w-none space-y-8 text-neutral-300">

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h2>
          <p>When you create an account or make a booking at Tee365, we collect:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Name and contact information (email address, phone number)</li>
            <li>Booking details (date, time, bay, duration)</li>
            <li>Payment information (processed securely by Stripe; we do not store card numbers)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Process and confirm your bookings</li>
            <li>Send SMS booking confirmations and access codes via Telnyx</li>
            <li>Send appointment reminders via SMS</li>
            <li>Manage your account and membership</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. SMS Communications</h2>
          <p>
            When creating an account at tee365.org/signup, you are required to check a mandatory consent checkbox
            before your account can be created. The checkbox reads:
          </p>
          <blockquote className="mt-3 border-l-4 border-white/20 pl-4 py-1 text-neutral-400 italic">
            "I agree to receive transactional SMS messages from Tee365 (booking confirmations and access codes).
            Msg &amp; data rates may apply. Reply STOP to opt out, HELP for info."
          </blockquote>
          <p className="mt-3">
            Tee365 sends two types of SMS messages only: booking confirmations (sent after payment is confirmed)
            and access code reminders (sent shortly before your session begins). No marketing or promotional
            SMS messages are sent.
          </p>
          <p className="mt-3">
            You may opt out at any time by replying <strong>STOP</strong> to any message from Tee365. Reply{" "}
            <strong>HELP</strong> for support, or contact us at info@tee365.org. Message and data rates may apply.
          </p>
          <p className="mt-3">
            For full details including sample messages and re-subscription instructions, see our{" "}
            <a href="/sms-opt-in" className="text-brand hover:underline">SMS Opt-In Policy</a>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Data Sharing</h2>
          <p>
            We do not sell your personal information. We share data only with trusted service providers necessary to operate our business (Supabase for database hosting, Stripe for payment processing, Telnyx for SMS, and the analytics providers described below). These providers are contractually obligated to protect your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Data Retention</h2>
          <p>
            We retain your account and booking data for as long as your account is active or as needed to provide services. You may request deletion of your account and data by contacting us at info@tee365.org.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. Security</h2>
          <p>
            We use industry-standard security measures including encrypted connections (HTTPS) and secure cloud infrastructure. Payment data is handled exclusively by Stripe and is never stored on our servers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Analytics and Cookies</h2>
          <p>
            We use a few analytics tools to understand how visitors use tee365.org, so we can fix problems and make booking easier:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Google Analytics</strong> (Google) counts visits and shows which pages are viewed and how visitors found us.</li>
            <li>
              <strong>Microsoft Clarity</strong> (Microsoft) records how visitors move through our public pages, such as clicks, scrolling,
              and where people get stuck, and creates heatmaps. Text you type into forms is hidden, and recording is turned off on account
              and admin pages. Payment details are entered directly into Stripe&apos;s secure form and are never visible to these tools.
            </li>
            <li><strong>Vercel Web Analytics</strong> (Vercel) counts page views without using cookies.</li>
          </ul>
          <p className="mt-3">
            These tools may collect your device type, browser, approximate location (city level, based on your IP address), the pages you
            visit, and how you interact with them. Google Analytics and Microsoft Clarity use cookies to recognize repeat visits. We use this
            information only to improve our website and do not sell it. Microsoft&apos;s use of data is described in the{" "}
            <a href="https://www.microsoft.com/privacy/privacystatement" className="text-brand hover:underline">Microsoft Privacy Statement</a>,
            and Google&apos;s in{" "}
            <a href="https://policies.google.com/technologies/partner-sites" className="text-brand hover:underline">How Google uses information from sites that use its services</a>.
          </p>
          <p className="mt-3">
            You can block or delete cookies in your browser settings, opt out of Google Analytics with the{" "}
            <a href="https://tools.google.com/dlpage/gaoptout" className="text-brand hover:underline">Google Analytics Opt-out Browser Add-on</a>,
            or use a private browsing window. The site and booking work normally either way.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Contact</h2>
          <p>
            For privacy questions or data requests, contact us at{" "}
            <a href="mailto:info@tee365.org" className="text-brand hover:underline">info@tee365.org</a>.
          </p>
        </section>

      </div>
    </main>
  )
}
