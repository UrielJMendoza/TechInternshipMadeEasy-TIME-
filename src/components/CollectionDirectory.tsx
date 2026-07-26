import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StructuredData } from "@/components/StructuredData";
import type { PublicCollection } from "@/lib/publicCatalog";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  type BreadcrumbItem,
} from "@/lib/seo";

export function CollectionDirectory({
  title,
  description,
  collections,
  breadcrumbs,
}: {
  title: string;
  description: string;
  collections: readonly PublicCollection[];
  breadcrumbs: readonly BreadcrumbItem[];
}) {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    numberOfItems: collections.length,
    itemListElement: collections.map((collection, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(collection.path),
      name: collection.shortTitle,
    })),
  };

  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <StructuredData data={[breadcrumbJsonLd(breadcrumbs), itemList]} />
      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <Breadcrumbs items={breadcrumbs} />
          <p className="mt-8 text-xs font-extrabold tracking-[0.14em] text-accent-hover uppercase">
            Public collections
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
            {description}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="collection-directory"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
      >
        <h2 id="collection-directory" className="text-2xl font-extrabold">
          Collections with enough current listings
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Every page below is generated from the current public listing
          snapshot. Collections below the evidence threshold stay out of this
          directory and the sitemap.
        </p>
        {collections.length > 0 ? (
          <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => (
              <li key={collection.path}>
                <article className="ui-card h-full p-5">
                  <p className="text-3xl font-extrabold tabular-nums">
                    {collection.jobs.length}
                  </p>
                  <h3 className="mt-3 text-lg font-extrabold">
                    <Link
                      href={collection.path}
                      className="hover:text-accent-hover"
                    >
                      {collection.shortTitle}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                    {collection.description}
                  </p>
                  <Link
                    href={collection.path}
                    className="mt-4 inline-block text-sm font-bold text-accent-hover hover:underline"
                  >
                    View real listings
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ui-card mt-7 border-dashed px-5 py-10 text-sm text-muted">
            The active snapshot is unavailable or no collection currently
            meets the publishing threshold.
          </div>
        )}
      </section>
    </main>
  );
}
