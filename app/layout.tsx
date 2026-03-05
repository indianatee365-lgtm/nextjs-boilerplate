import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
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
        <Header />
        <div className="mx-auto max-w-5xl px-6 py-12">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}