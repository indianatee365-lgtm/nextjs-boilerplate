import HeroFull from "./components/sections/HeroFull"
import HowItWorks from "./components/sections/HowItWorks"
import FeatureBand from "./components/sections/FeatureBand"
import Info from "./components/sections/Info"
import LocalSEO from "./components/sections/LocalSEO"
import PageContainer from "./components/PageContainer"

export default function HomePage() {
  return (
    <main className="relative z-10 pb-20">
      {/* Full-bleed hero */}
      <HeroFull />

      {/* Constrained content */}
      <PageContainer>
        <div className="space-y-16">
          <HowItWorks />
          <LocalSEO />
          <FeatureBand />
          <Info />
        </div>
      </PageContainer>
    </main>
  )
}