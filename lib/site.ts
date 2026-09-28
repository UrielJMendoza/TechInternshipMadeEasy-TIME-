import type { Metadata } from "next";

/** Public identity shared by metadata, crawl files and structured data. */
export const SITE_URL = "https://timley.dev";
export const SITE_NAME = "Timley";
export const SITE_TITLE = "Timley | Internships and new-grad jobs";
export const SITE_DESCRIPTION =
  "Search internships and new-grad jobs by major, location, and work style. No account required.";
export const SITE_THEME_COLOR = "#080808";

const SITE_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "Timley internships and new-grad job index" };

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

/**
 * Page-level metadata with a canonical URL and matching share cards. Open
 * Graph objects replace the layout's rather than merging, so each indexable
 * page states its own URL instead of inheriting the homepage's.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      locale: "en_US",
      siteName: SITE_NAME,
      title,
      description,
      images: [SITE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SITE_IMAGE.url],
    },
  };
}
