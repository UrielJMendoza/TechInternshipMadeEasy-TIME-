import type { Metadata } from "next";
import { CollectionDirectory } from "@/components/CollectionDirectory";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { buildPublicCollections } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 21600;

export const metadata: Metadata = publicPageMetadata({
  title: "Jobs by location",
  description:
    "Browse Timley location pages that currently have enough real internship and new-grad listings to be useful.",
  path: "/discover/locations",
});

export default async function LocationDirectoryPage() {
  const snapshot = await fetchJobsSnapshot();
  const collections = buildPublicCollections(
    snapshot.jobs,
    Date.parse(snapshot.generatedAt),
  ).filter(
    (collection) => collection.kind === "location" && collection.indexable,
  );

  return (
    <CollectionDirectory
      title="Internships and new-grad roles by location."
      description="Location pages use explicit public listing text and Timley’s documented U.S. city and metro aliases. Multi-location roles can appear in more than one collection."
      collections={collections}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Discover", path: "/discover" },
        { name: "Locations", path: "/discover/locations" },
      ]}
    />
  );
}
