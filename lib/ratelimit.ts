import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60s"),
  analytics: true,
});

export const giftCardRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60s"),
  analytics: true,
});
