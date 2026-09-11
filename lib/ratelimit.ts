import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const noopLimiter = { limit: async () => ({ success: true }) } as unknown as Ratelimit

function makeRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const redis = makeRedis()

export const authRatelimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "60s"), analytics: true })
  : noopLimiter

export const giftCardRatelimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "60s"), analytics: true })
  : noopLimiter

// Unauthenticated endpoints that mint Stripe PaymentIntents. Tighter than the
// balance checker on purpose: a real buyer creates one intent per checkout
// (a couple more if they retry), while an unthrottled create-intent endpoint
// is a card-testing surface. Added 2026-09-11 - /api/gift-cards/payment-intent
// had no limiter at all.
export const checkoutRatelimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(8, "300s"), analytics: true })
  : noopLimiter
