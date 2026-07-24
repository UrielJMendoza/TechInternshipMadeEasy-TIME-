import type { Metadata } from "next";
import { getUsLocationDisplay, isRemoteLocation } from "@/lib/jobLocations";
import { jobPublicPath } from "@/lib/publicCatalog";
import type { Internship } from "@/lib/types";

export const SITE_URL = "https://timley.dev";
export const OG_IMAGE = {
  url: "/og-v2.png",
  width: 1200,
  height: 630,
  alt: "Timley job discovery and application tracking",
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function publicPageMetadata({
  title,
  description,
  path,
  indexable = true,
}: {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: {
      index: indexable,
      follow: true,
    },
    openGraph: {
      title: `${title} | Timley`,
      description,
      url: path,
      siteName: "Timley",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Timley`,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListJsonLd(
  name: string,
  jobs: readonly Internship[],
  path: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: absoluteUrl(path),
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 50).map((job, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(jobPublicPath(job)),
      name: `${job.title} at ${job.company}`,
    })),
  };
}

export function siteIdentityJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Timley",
      url: SITE_URL,
      description:
        "An account-optional job-discovery and application-tracking utility.",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Timley",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/jobs?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

function jobLocationJsonLd(job: Internship) {
  const location = getUsLocationDisplay(job.location);
  if (isRemoteLocation(job.location)) {
    return {
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: {
        "@type": "Country",
        name: "United States",
      },
    };
  }

  const firstLocation = location.split(";")[0]?.trim() ?? location;
  const match = firstLocation.match(/^(.+?),\s*([A-Z]{2})(?:\b|$)/);
  return {
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(match
          ? {
              addressLocality: match[1],
              addressRegion: match[2],
            }
          : {}),
        addressCountry: "US",
      },
    },
  };
}

/**
 * Emitted only on a visible, active internal detail page. The description
 * deliberately matches Timley's observational page copy rather than
 * pretending to be an employer-authored job description.
 */
export function jobPostingJsonLd(job: Internship) {
  const description = jobPostingDescription(job);
  const datePosted = (job.posted_date ?? job.first_seen_at).slice(0, 10);

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    datePosted,
    employmentType: job.role_type === "internship" ? "INTERN" : "FULL_TIME",
    directApply: false,
    url: absoluteUrl(jobPublicPath(job)),
    identifier: {
      "@type": "PropertyValue",
      name: "Timley public listing record",
      value: job.id,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    ...jobLocationJsonLd(job),
  };
}

export function jobPostingDescription(job: Internship): string {
  return `Timley observed an active ${job.role_type === "internship" ? "internship" : "new-grad"} listing for ${job.title} at ${job.company}. Review the visible source, location, freshness, pay, and sponsorship evidence before following the external application destination.`;
}
