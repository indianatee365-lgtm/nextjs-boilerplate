import Header from "@/app/components/Header"
import Footer from "@/app/components/Footer"
import AnnouncementBar from "@/app/components/AnnouncementBar"
import type { ReactNode } from "react"

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnnouncementBar />
      <Header />
      {children}
      <Footer />
    </>
  )
}
