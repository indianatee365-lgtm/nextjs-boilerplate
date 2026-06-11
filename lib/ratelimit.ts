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
