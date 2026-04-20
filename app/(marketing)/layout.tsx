import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import type { ReactNode } from "react"

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  )
}
