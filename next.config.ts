import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/membership", destination: "/join", permanent: true },
      // Founder's Club is retired and will not come back. The page was a full
      // marketing pitch, SEO-indexed, with a join button that could only ever
      // return a 409 because checkout refuses the plan past its deadline. A 301
      // keeps whatever inbound link equity it earned and sends those visitors
      // somewhere they can actually buy something. Existing founders keep every
      // benefit; that is handled in their account and by the phone agent, not here.
      { source: "/founders", destination: "/join", permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
};

export default nextConfig;
