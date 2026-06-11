import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const noopLimiter = { limit: async () => ({ success: true }) } as unknown as Ratelimit

function makeRatelimit(limiter: Parameters<typeof Ratelimit>[0]["limiter"]) {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return noopLimiter
  return new Ratelimit({ redis: new Redis({ url, token }), limiter, analytics: true })
}

export const authRatelimit = makeRatelimit(Ratelimit.slidingWindow(5, "60s"))
export const giftCardRatelimit = makeRatelimit(Ratelimit.slidingWindow(30, "60s"))
