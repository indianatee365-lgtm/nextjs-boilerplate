import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-black text-white">
        <Header />
        <div className="mx-auto max-w-5xl px-6 py-12">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
