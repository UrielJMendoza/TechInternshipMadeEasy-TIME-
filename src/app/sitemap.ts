import type { MetadataRoute } from "next";
import { fetchPublicJobsSnapshot } from "@/lib/jobs";
import {
  buildCampusCollections,
  buildCompanyProfiles,
  buildPublicCollections,
  isLegitimateActiveJob,
  jobPublicPath,
} from "@/lib/publicCatalog";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 300;

function safeDate(value: string | null | undefined, fallback: Date): Date {
  const date = value ? new Date(value) : fallback;
  return Number.isFinite(date.getTime()) ? date : fallback;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await fetchPublicJobsSnapshot();
  const generatedAt = safeDate(snapshot.generatedAt, new Date());
  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/jobs"),
      lastModified: safeDate(snapshot.updatedAt, generatedAt),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/discover"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/discover/locations"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/discover/seasons"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/collections/campus"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/companies"),
      lastModified: generatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...["/changelog", "/privacy", "/terms"].map((path) => ({
      url: absoluteUrl(path),
      lastModified: generatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.3,
    })),
  ];

  // Dynamic URLs enter the sitemap only from a complete, usable snapshot.
  if (snapshot.loadError || snapshot.partialData) return entries;

  const now = generatedAt.getTime();
  const collections = buildPublicCollections(snapshot.jobs, now).filter(
    (collection) => collection.indexable,
  );
  const campusCollections = buildCampusCollections(snapshot.jobs, now).filter(
    (collection) => collection.indexable,
  );
  const companies = buildCompanyProfiles(snapshot.jobs, []).filter(
    (company) => company.indexable,
  );

  for (const collection of [...collections, ...campusCollections]) {
    entries.push({
      url: absoluteUrl(collection.path),
      lastModified: safeDate(collection.updatedAt, generatedAt),
      changeFrequency: "daily",
      priority: collection.kind === "freshness" ? 0.8 : 0.7,
    });
  }
  for (const company of companies) {
    entries.push({
      url: absoluteUrl(`/companies/${company.slug}`),
      lastModified: safeDate(company.lastObservedAt, generatedAt),
      changeFrequency: "daily",
      priority: 0.6,
    });
  }
  for (const job of snapshot.jobs.filter(isLegitimateActiveJob)) {
    entries.push({
      url: absoluteUrl(jobPublicPath(job)),
      lastModified: safeDate(job.last_seen_at, generatedAt),
      changeFrequency: "daily",
      priority: 0.5,
    });
  }

  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
