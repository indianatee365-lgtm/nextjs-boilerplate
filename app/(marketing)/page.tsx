import HeroFull from "@/app/components/sections/HeroFull"
import HowItWorks from "@/app/components/sections/HowItWorks"
import TechBand from "@/app/components/sections/TechBand"
import FeatureBand from "@/app/components/sections/FeatureBand"
import Info from "@/app/components/sections/Info"
import LeagueBand from "@/app/components/sections/LeagueBand"
import BlackFridayBand from "@/app/components/sections/BlackFridayBand"
import LocalSEO from "@/app/components/sections/LocalSEO"
import Reviews from "@/app/components/sections/Reviews"
import PageContainer from "@/app/components/PageContainer"
import type { Metadata } from "next"

// The league band reads the leagues row; refresh every 5 minutes.
export const revalidate = 300

// The canonical lives here, not in the root layout. In the layout every page
// without its own canonical inherited the homepage one, which told Google that
// /book, /events/<slug> and /parties/<slug> were duplicates of the homepage.
export const metadata: Metadata = {
  alternates: { canonical: "https://tee365.org" },
}

export default function HomePage() {
  return (
    <main className="relative z-10 pb-20">
      {/* Full-bleed hero */}
      <HeroFull />

      {/* Constrained content */}
      <PageContainer>
        <div className="space-y-16">
          <BlackFridayBand />
          <LeagueBand />
          <HowItWorks />
          <Reviews />
          <TechBand />
          <LocalSEO />
          <FeatureBand />
          <div id="waitlist" className="scroll-mt-20">
            <Info />
          </div>
        </div>
      </PageContainer>
    </main>
  )
}