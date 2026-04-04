import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { GoogleAnalytics } from "@next/third-parties/google";

const LOCAL_BUSINESS_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Tee365",
  description:
    "24/7 indoor golf simulator bays in South Bend, Indiana near Notre Dame and the Michiana region.",
  url: "https://tee365.org",
  logo: "https://tee365.org/favicon.ico",
  image: "https://tee365.org/hero.jpg",
  address: {
    "@type": "PostalAddress",
    addressLocality: "South Bend",
    addressRegion: "IN",
    addressCountry: "US",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: "41.6764",
    longitude: "-86.2520",
  },
  openingHours: "Mo-Su 00:00-23:59",
  sameAs: [
    "https://www.instagram.com/tee365.mishawaka",
    "https://www.facebook.com/people/Tee365/61578292102933/",
    "https://www.tiktok.com/@tee36568",
  ],
};

export const metadata: Metadata = {
  title: "Indoor Golf Simulator in South Bend Near Notre Dame | Tee365",
  description:
    "Book a private 24/7 indoor golf simulator bay in South Bend, IN — minutes from Notre Dame. Practice year-round, play full courses, and compete.",
  alternates: {
    canonical: "https://tee365.org",
  },
  openGraph: {
    type: "website",
    title: "Indoor Golf Simulator in South Bend Near Notre Dame | Tee365",
    description:
      "Book a private 24/7 indoor golf simulator bay in South Bend, IN — minutes from Notre Dame. Practice year-round, play full courses, and compete.",
    url: "https://tee365.org",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Indoor Golf Simulator in South Bend Near Notre Dame | Tee365",
    description:
      "Book a private 24/7 indoor golf simulator bay in South Bend, IN — minutes from Notre Dame. Practice year-round, play full courses, and compete.",
    images: ["https://tee365.org/hero.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" />
      </head>
      <body className="relative overflow-x-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_SCHEMA) }}
        />
        <div className="pointer-events-none fixed -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl opacity-20" style={{ backgroundColor: "var(--brandGlow)" }} />
        <Header />
        {children}
        <Footer />
      </body>
      <GoogleAnalytics gaId="G-LJZ2L1GD7Y" />
    </html>
  );
}
