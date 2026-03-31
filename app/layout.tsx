import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { GoogleAnalytics } from "@next/third-parties/google";

export const metadata: Metadata = {
  title: "Indoor Golf Simulator in South Bend Near Notre Dame | Tee365",
  description:
    "24/7 indoor golf simulator bays in South Bend, Indiana near Notre Dame and the Michiana region.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="relative overflow-x-hidden">
        <div className="pointer-events-none fixed -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl opacity-20" style={{ backgroundColor: "var(--brandGlow)" }} />
        <Header />
        {children}
        <Footer />
      </body>
      <GoogleAnalytics gaId="G-LJZ2L1GD7Y" />
    </html>
  );
}