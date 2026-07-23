import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicCollectionView } from "@/components/PublicCollectionView";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { findPublicCollection } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

const getSnapshot = cache(fetchJobsSnapshot);

async function getCollection(slug: string) {
  const snapshot = await getSnapshot();
  return {
    snapshot,
    collection: findPublicCollection(
      snapshot.jobs,
      Date.parse(snapshot.generatedAt),
      slug,
    ),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { snapshot, collection } = await getCollection(slug);
  if (!collection) {
    return publicPageMetadata({
      title: "Collection not found",
      description: "This Timley public collection does not exist.",
      path: `/discover/${slug}`,
      indexable: false,
    });
  }
  return publicPageMetadata({
    title: collection.shortTitle,
    description: `${collection.description} ${collection.jobs.length} active matches in the current visible snapshot.`,
    path: collection.path,
    indexable:
      collection.indexable && !snapshot.loadError && !snapshot.partialData,
  });
}

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { snapshot, collection } = await getCollection(slug);
  if (!collection) notFound();

  return (
    <PublicCollectionView
      collection={collection}
      partialData={snapshot.partialData}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Discover", path: "/discover" },
        { name: collection.shortTitle, path: collection.path },
      ]}
    />
  );
}
