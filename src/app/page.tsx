import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { fetchJobsSnapshot } from "@/lib/jobs";
import {
  selectListingCompanies,
  selectShowcaseJob,
} from "@/lib/landingData";
import { OG_IMAGE } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: {
    absolute: "Timley — find jobs early, track them cleanly",
  },
  description:
    "Fresh internships and new-grad roles, with a built-in application tracker. No account required.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Find it early. Track it cleanly. | Timley",
    description:
      "Fresh internships and new-grad roles, with a built-in application tracker. No account required.",
    url: "/",
    siteName: "Timley",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find it early. Track it cleanly. | Timley",
    description:
      "Fresh internships and new-grad roles, with a built-in application tracker. No account required.",
    images: [OG_IMAGE.url],
  },
};

export default async function HomePage() {
  const snapshot = await fetchJobsSnapshot();
  const now = Date.parse(snapshot.generatedAt);

  return (
    <LandingPage
      jobs={snapshot.jobs.slice(0, 12)}
      companies={selectListingCompanies(snapshot.jobs)}
      showcaseJob={selectShowcaseJob(snapshot.jobs, now)}
      generatedAt={snapshot.generatedAt}
    />
  );
}
