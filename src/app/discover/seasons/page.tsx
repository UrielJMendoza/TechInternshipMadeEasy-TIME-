import type { Metadata } from "next";
import { CollectionDirectory } from "@/components/CollectionDirectory";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { buildPublicCollections } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 21600;

export const metadata: Metadata = publicPageMetadata({
  title: "Jobs by hiring season",
  description:
    "Browse hiring-season pages backed by explicit season evidence in current Timley internship and new-grad listings.",
  path: "/discover/seasons",
});

export default async function SeasonDirectoryPage() {
  const snapshot = await fetchJobsSnapshot();
  const collections = buildPublicCollections(
    snapshot.jobs,
    Date.parse(snapshot.generatedAt),
  ).filter(
    (collection) => collection.kind === "season" && collection.indexable,
  );

  return (
    <CollectionDirectory
      title="Current roles by hiring season."
      description="These collections use normalized season text present in public source data. Timley does not infer a season when a listing does not provide one."
      collections={collections}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Discover", path: "/discover" },
        { name: "Hiring seasons", path: "/discover/seasons" },
      ]}
    />
  );
}
