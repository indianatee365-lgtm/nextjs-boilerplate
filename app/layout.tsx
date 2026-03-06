import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { GoogleAnalytics } from "@next/third-parties/google";

export const metadata: Metadata = {
  title: "Indoor Golf Simulator Near Notre Dame | Tee365 Mishawaka Indiana",
  description:
    "24/7 indoor golf simulator bays in Mishawaka near Notre Dame and South Bend.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
      <GoogleAnalytics gaId="G-LJZ2L1GD7Y" />
    </html>
  );
}