import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicCollectionView } from "@/components/PublicCollectionView";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { buildCampusCollections } from "@/lib/publicCatalog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 86400;

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

const getSnapshot = cache(fetchJobsSnapshot);

async function getCampusCollection(slug: string) {
  const snapshot = await getSnapshot();
  return {
    snapshot,
    collection:
      buildCampusCollections(
        snapshot.jobs,
        Date.parse(snapshot.generatedAt),
      ).find(
        (candidate) => candidate.slug === slug,
      ) ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { snapshot, collection } = await getCampusCollection(slug);
  if (!collection) {
    return publicPageMetadata({
      title: "Campus collection not found",
      description: "This Timley campus collection does not exist.",
      path: `/collections/campus/${slug}`,
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

export default async function CampusCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { snapshot, collection } = await getCampusCollection(slug);
  if (!collection) notFound();

  return (
    <PublicCollectionView
      collection={collection}
      partialData={snapshot.partialData}
      breadcrumbs={[
        { name: "Home", path: "/" },
        { name: "Campus collections", path: "/collections/campus" },
        { name: collection.shortTitle, path: collection.path },
      ]}
    />
  );
}
