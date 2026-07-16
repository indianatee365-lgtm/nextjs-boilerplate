import HeroFull from "@/app/components/sections/HeroFull"
import HowItWorks from "@/app/components/sections/HowItWorks"
import TechBand from "@/app/components/sections/TechBand"
import FeatureBand from "@/app/components/sections/FeatureBand"
import Info from "@/app/components/sections/Info"
import LocalSEO from "@/app/components/sections/LocalSEO"
import PageContainer from "@/app/components/PageContainer"

export default function HomePage() {
  return (
    <main className="relative z-10 pb-20">
      {/* Full-bleed hero */}
      <HeroFull />

      {/* Constrained content */}
      <PageContainer>
        <div className="space-y-16">
          <HowItWorks />
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