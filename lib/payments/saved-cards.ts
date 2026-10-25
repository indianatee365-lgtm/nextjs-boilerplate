import Stripe from "stripe"

// Lets Stripe's Payment Element show a customer's saved cards at checkout.
// Every paid booking has saved the card to the customer's Stripe record
// (setup_future_usage) since launch, but checkout always showed a blank card
// form, so customers retyped it every time (Chase asked for this 2026-10-25).
//
// Cards saved that way carry allow_redisplay "unspecified", which the Payment
// Element hides by default, so the filter has to include it. Saving and
// removing stay off here: booking checkout already saves the card through the
// PaymentIntent, and cards are managed on /account.
//
// Returns null on any failure. A missing customer session only means a blank
// card form, exactly what checkout showed before, so it must never stop a
// payment.
export async function createSavedCardsSession(stripe: Stripe, customerId: string | null): Promise<string | null> {
  if (!customerId) return null
  try {
    const session = await stripe.customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_allow_redisplay_filters: ["always", "limited", "unspecified"],
            payment_method_save: "disabled",
            payment_method_remove: "disabled",
          },
        },
      },
    })
    return session.client_secret
  } catch (err) {
    console.error("[createSavedCardsSession]", err)
    return null
  }
}
