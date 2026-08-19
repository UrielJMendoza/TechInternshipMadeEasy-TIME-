import type { Metadata } from "next";
import { CollectionDirectory } from "@/components/CollectionDirectory";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { buildCampusCollections } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 21600;

export const metadata: Metadata = publicPageMetadata({
  title: "Shareable campus job collections",
  description:
    "Reusable, unaffiliated public job collections that campus groups and clubs can share without exposing private tracker data.",
  path: "/collections/campus",
});

export default async function CampusCollectionsPage() {
  const snapshot = await fetchJobsSnapshot();
  const collections = buildCampusCollections(
    snapshot.jobs,
    Date.parse(snapshot.generatedAt),
  ).filter((collection) => collection.indexable);

  return (
    <CollectionDirectory
      title="Collections a campus group can share."
      description="These are reusable public filter bundles, not school-specific feeds. Timley has no campus-affiliation field and does not imply that a school, club, or employer endorses a collection."
      collections={collections}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Campus collections", path: "/collections/campus" },
      ]}
    />
  );
}
