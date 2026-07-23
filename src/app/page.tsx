import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { fetchJobsSnapshot } from "@/lib/jobs";
import {
  deriveLandingStats,
  selectListingCompanies,
  selectShowcaseJob,
} from "@/lib/landingData";
import { OG_IMAGE } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    absolute: "Timley — fresh jobs, clearly organized",
  },
  description:
    "Find fresh internships and new-grad roles, inspect the available evidence, and track every application from one clean workspace.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Your next opportunity shouldn’t be buried. | Timley",
    description:
      "Find fresh internships and new-grad roles, inspect the available evidence, and track every application from one clean workspace.",
    url: "/",
    siteName: "Timley",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Timley — fresh jobs, clearly organized",
    description:
      "Find fresh internships and new-grad roles, inspect the available evidence, and track every application from one clean workspace.",
    images: [OG_IMAGE.url],
  },
};

export default async function HomePage() {
  const snapshot = await fetchJobsSnapshot();
  const now = Date.parse(snapshot.generatedAt);
  const stats = deriveLandingStats(
    snapshot.jobs,
    snapshot.updatedAt,
    now,
    snapshot.loadError,
  );

  return (
    <LandingPage
      jobs={snapshot.jobs.slice(0, 12)}
      companies={selectListingCompanies(snapshot.jobs)}
      showcaseJob={selectShowcaseJob(snapshot.jobs, now)}
      stats={stats}
      generatedAt={snapshot.generatedAt}
    />
  );
}
