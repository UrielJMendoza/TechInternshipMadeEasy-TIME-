import { DiscoveryShowcase } from "@/components/landing/DiscoveryShowcase";
import { LandingHero } from "@/components/landing/LandingHero";
import { TrackerShowcase } from "@/components/landing/TrackerShowcase";
import type { Internship } from "@/lib/types";

interface LandingPageProps {
  jobs: Internship[];
  companies: string[];
  showcaseJob: Internship | null;
  generatedAt: string;
}

export function LandingPage({
  jobs,
  companies,
  generatedAt,
}: LandingPageProps) {
  return (
    <main id="main-content" className="landing-page">
      <LandingHero companies={companies} />

      <DiscoveryShowcase jobs={jobs} generatedAt={generatedAt} />
      <TrackerShowcase jobs={jobs.slice(0, 3)} />
    </main>
  );
}
