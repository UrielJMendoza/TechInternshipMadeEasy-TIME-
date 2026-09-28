import type { MetadataRoute } from "next";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getPublicJobsSnapshot();
  const jobs = snapshot.jobs.filter(job => job.active && job.eligibilityStatus !== "quarantined");
  const feedUpdatedAt = jobs.reduce<string | undefined>((latest, job) => {
    const updatedAt = job.evidenceCheckedAt ?? job.lastSeenAt;
    return !latest || updatedAt > latest ? updatedAt : latest;
  }, undefined);
  return [
    {
      url: SITE_URL,
      lastModified: feedUpdatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/jobs`,
      lastModified: feedUpdatedAt,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/how-it-works`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    ...jobs.map(job => ({
      url: `${SITE_URL}/jobs/${encodeURIComponent(job.id)}`,
      lastModified: job.evidenceCheckedAt ?? job.lastSeenAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
