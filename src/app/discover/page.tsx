import type { Metadata } from "next";
import { CollectionDirectory } from "@/components/CollectionDirectory";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { buildPublicCollections } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = publicPageMetadata({
  title: "Explore current job collections",
  description:
    "Browse data-backed internship, new-grad, category, location, season, evidence, and newly observed job collections on Timley.",
  path: "/discover",
});

export default async function DiscoverPage() {
  const snapshot = await fetchJobsSnapshot();
  const now = Date.parse(snapshot.generatedAt);
  const collections = buildPublicCollections(snapshot.jobs, now).filter(
    (collection) => collection.indexable && collection.kind !== "campus",
  );

  return (
    <CollectionDirectory
      title="Explore useful job collections."
      description="These pages contain server-rendered results from Timley’s real active listing snapshot, plus visible freshness and inclusion methodology. No filler pages are published just to target a keyword."
      collections={collections.filter(
        (collection) =>
          collection.kind !== "location" && collection.kind !== "season",
      )}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Discover", path: "/discover" },
      ]}
    />
  );
}
