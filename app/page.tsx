import HeroFull from "./components/sections/HeroFull";
import HowItWorks from "./components/sections/HowItWorks";
import FeatureBand from "./components/sections/FeatureBand";
import Info from "./components/sections/Info";
import LocalSEO from "./components/sections/LocalSEO"
export default function HomePage() {
  return (
    <main className="relative z-10 pb-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="space-y-16">
          <HeroFull />
          <HowItWorks />
          <LocalSEO />
          <FeatureBand />
          <Info />
        </div>
      </div>
    </main>
  )
}