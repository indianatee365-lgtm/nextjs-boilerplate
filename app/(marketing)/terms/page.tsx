import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms & Conditions | Tee365",
  description: "Terms and conditions for using Tee365 indoor golf simulator booking services.",
  alternates: { canonical: "https://tee365.org/terms" },
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold text-white mb-2">Terms &amp; Conditions</h1>
      <p className="text-sm text-neutral-500 mb-10">Last updated: May 5, 2026</p>

      <div className="prose prose-invert prose-sm max-w-none space-y-8 text-neutral-300">

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>
            By creating an account or making a booking at Tee365 ("we," "us," or "our"), you agree to these Terms and Conditions. If you do not agree, do not use our services.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">2. Booking & Payment</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>All bookings require full payment at the time of reservation via Stripe.</li>
            <li>Prices are displayed before checkout and are subject to change without notice for future bookings.</li>
            <li>Bookings are confirmed only after successful payment processing.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">3. Cancellations & Refunds</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Cancellations made more than 24 hours before the session start time are eligible for a full refund to the original payment method.</li>
            <li>Cancellations within 24 hours of the session start time are non-refundable. The full session amount is forfeited.</li>
            <li>Tee365 reserves the right to cancel bookings due to equipment failure or emergency. A full refund will be issued in such cases.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">4. Rescheduling</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Bookings may be rescheduled up to <strong>4 hours before the session start time</strong> through your account at <a href="/account/bookings" className="text-brand hover:underline">tee365.org/account/bookings</a>.</li>
            <li>A <strong>flat $5.00 reschedule fee</strong> applies to every reschedule, regardless of the new time selected.</li>
            <li>The new session is priced at the current rate for the selected day and time. If the new rate is higher than the original rate, you will be charged the difference plus the $5.00 fee. If the new rate is lower, you will receive a refund of the difference, and the $5.00 fee will still apply.</li>
            <li>Rescheduling within 4 hours of the session start time is not permitted through self-service. Contact us at <a href="mailto:info@tee365.org" className="text-brand hover:underline">info@tee365.org</a> — we will do our best to accommodate you based on availability, but cannot guarantee a reschedule at that point.</li>
            <li>Tee365 reserves the right to deny a reschedule request if no suitable availability exists.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">5. Access Codes</h2>
          <p>
            A unique 6-digit access code will be sent via SMS approximately 15 minutes before your session. This code is required to access the facility. Do not share your access code. Tee365 is not responsible for unauthorized use of shared access codes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">6. SMS Communications</h2>
          <p>
            By providing your phone number during registration, you consent to receive transactional SMS messages including booking confirmations and access codes. Message and data rates may apply. Reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for support. Message frequency varies based on booking activity.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">7. Facility Rules</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Users are responsible for any damage caused to equipment during their session.</li>
            <li>No food or drinks near simulator equipment.</li>
            <li>Sessions end at the scheduled time regardless of late arrival.</li>
            <li>Tee365 is a 24/7 unstaffed facility. Use at your own risk.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">8. Limitation of Liability</h2>
          <p>
            Tee365 is not liable for personal injury, loss, or damage to personal property during your session. Users assume all risk associated with use of the facility and equipment.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-2">9. Contact</h2>
          <p>
            Questions about these terms? Contact us at{" "}
            <a href="mailto:info@tee365.org" className="text-brand hover:underline">info@tee365.org</a>.
          </p>
        </section>

      </div>
    </main>
  )
}
