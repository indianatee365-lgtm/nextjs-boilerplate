import HeroFull from "./components/sections/HeroFull";
import HowItWorks from "./components/sections/HowItWorks";
import FeatureBand from "./components/sections/FeatureBand";
import Info from "./components/sections/Info";

export default function HomePage() {
  return (
    <main className="relative z-10 space-y-16 pb-20">
      <HeroFull />
      <HowItWorks />
      <FeatureBand />
      <Info />
    </main>
  );
}