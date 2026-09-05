import type { MetadataRoute } from "next";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";

const SITE_URL = "https://timley.dev";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getPublicJobsSnapshot();
  return [
    ...snapshot.jobs.filter(job => job.active && job.eligibilityStatus !== "quarantined").map(job => ({url:`${SITE_URL}/jobs/${encodeURIComponent(job.id)}`,lastModified:job.evidenceCheckedAt ?? job.lastSeenAt})),
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/jobs`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/how-it-works`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
