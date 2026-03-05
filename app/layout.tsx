import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import Header from "./components/Header";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: "Indoor Golf Simulator Near Notre Dame | Tee365 Mishawaka Indiana",
  description:
    "24/7 indoor golf simulator bays in Mishawaka near Notre Dame and South Bend. Private bays for practice, quick rounds, and year-round golf in the Michiana region.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-black text-white">
        {/* Site-wide background glow */}
        <div
          className="pointer-events-none fixed inset-0 -z-10 opacity-40 blur-3xl"
          aria-hidden="true"
        >
          <div className="absolute left-[-120px] top-[-120px] h-[620px] w-[620px] rounded-full bg-emerald-500/20" />
          <div className="absolute right-[-160px] bottom-[-180px] h-[520px] w-[520px] rounded-full bg-emerald-400/10" />
        </div>

        <Script
          id="tee365-localbusiness"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SportsActivityLocation",
              name: "Tee365",
              url: "https://tee365.org",
              description:
                "24/7 indoor golf simulator bays in Mishawaka, Indiana near Notre Dame and South Bend.",
              areaServed: [
                "Mishawaka, IN",
                "South Bend, IN",
                "Notre Dame, IN",
                "Granger, IN",
              ],
            }),
          }}
        />

        <Header />
        <div className="mx-auto max-w-5xl px-6 py-12">{children}</div>
        <Footer />
      </body>
    </html>
  );
}