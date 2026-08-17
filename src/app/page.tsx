import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { fetchJobsSnapshot } from "@/lib/jobs";
import {
  selectLandingPreviewJobs,
  selectListingCompanies,
  selectShowcaseJob,
} from "@/lib/landingData";
import { OG_IMAGE } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: {
    absolute: "Timley | jobs and application tracking",
  },
  description:
    "Find open internships and new-grad roles, then organize applications in your browser.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Timley | jobs and application tracking",
    description:
      "Find open internships and new-grad roles, then organize applications in your browser.",
    url: "/",
    siteName: "Timley",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Timley | jobs and application tracking",
    description:
      "Find open internships and new-grad roles, then organize applications in your browser.",
    images: [OG_IMAGE.url],
  },
};

export default async function HomePage() {
  const snapshot = await fetchJobsSnapshot();
  const now = Date.parse(snapshot.generatedAt);
  const previewJobs = selectLandingPreviewJobs(snapshot.jobs);

  return (
    <LandingPage
      jobs={previewJobs}
      companies={selectListingCompanies(snapshot.jobs)}
      showcaseJob={selectShowcaseJob(previewJobs, now)}
      generatedAt={snapshot.generatedAt}
    />
  );
}
