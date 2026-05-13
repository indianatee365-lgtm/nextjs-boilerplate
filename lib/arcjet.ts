import arcjet, { shield, slidingWindow } from "@arcjet/next";

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [shield({ mode: "LIVE" })],
});

export const authAj = aj.withRule(
  slidingWindow({ mode: "LIVE", interval: "60s", max: 5 })
);

export const giftCardAj = aj.withRule(
  slidingWindow({ mode: "LIVE", interval: "60s", max: 30 })
);
