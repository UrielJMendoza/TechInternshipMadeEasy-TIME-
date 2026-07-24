import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { fetchJobsSnapshot } from "@/lib/jobs";
import {
  selectLandingPreviewJobs,
  selectListingCompanies,
  selectShowcaseJob,
} from "@/lib/landingData";
import { OG_IMAGE } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    absolute: "Timley | fresh internships and new grad roles",
  },
  description:
    "Fresh internships and new-grad roles, plus a simple tracker for every next step. No account required.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Your next role, right on time. | Timley",
    description:
      "Fresh internships and new-grad roles, plus a simple tracker for every next step. No account required.",
    url: "/",
    siteName: "Timley",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your next role, right on time. | Timley",
    description:
      "Fresh internships and new-grad roles, plus a simple tracker for every next step. No account required.",
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
