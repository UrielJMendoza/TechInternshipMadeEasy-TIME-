import type { JobListItem } from "@/lib/jobs";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

type JsonLd = Record<string, unknown>;

const WEBSITE_ID = `${SITE_URL}/#website`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * Serialize JSON-LD for an inline script. Job titles, companies and summaries
 * come from third-party sources, so every character that could close the
 * script element or start an HTML comment is escaped.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function siteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
        publisher: { "@id": ORGANIZATION_ID },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/jobs?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/icon-512.png"),
          width: 512,
          height: 512,
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: readonly { name: string; path: string }[]): JsonLd {
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

const US_STATES: Readonly<Record<string, string>> = Object.freeze({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
});
const STATE_CODE_BY_NAME = new Map(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]),
);
const US_COUNTRY = /^(?:us|usa|u\.s\.a?\.?|united states(?: of america)?)$/i;
const MAX_JOB_LOCATIONS = 10;

type ParsedLocations = {
  places: JsonLd[];
  remoteUs: boolean;
};

function stateCode(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Z]{2}$/.test(trimmed) && US_STATES[trimmed]) return trimmed;
  return STATE_CODE_BY_NAME.get(trimmed.toLowerCase()) ?? null;
}

function usPlace(locality: string | null, region: string | null): JsonLd {
  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      ...(locality ? { addressLocality: locality } : {}),
      ...(region ? { addressRegion: region } : {}),
      addressCountry: "US",
    },
  };
}

/**
 * Recognize only unambiguous United States locations. Anything else is left
 * out rather than guessed, because inaccurate job locations violate search
 * engines' structured-data policies.
 */
export function parseUsJobLocations(location: string): ParsedLocations {
  const places: JsonLd[] = [];
  let remoteUs = false;
  for (const rawSegment of location.split(";")) {
    const labelled = rawSegment.trim().replace(/\s*\+\d+$/, "");
    if (!labelled) continue;
    if (/^remote(?:\s*(?:in|-|,)\s*(?:the\s+)?(?:us|usa|united states))?$/i.test(labelled) ||
      /^(?:us|usa|united states)\s*-\s*remote$/i.test(labelled)) {
      remoteUs = true;
      continue;
    }
    if (US_COUNTRY.test(labelled)) {
      places.push(usPlace(null, null));
      continue;
    }
    const segment = labelled.replace(/\s*(?:,|\s-)\s*(?:united states|usa)$/i, "").trim();
    // A bare two-letter segment such as "LA" usually names a city, and a bare
    // "Washington" may mean DC, so standalone regions need an unambiguous name.
    const region = segment.toLowerCase() === "washington"
      ? null
      : STATE_CODE_BY_NAME.get(segment.toLowerCase()) ?? null;
    if (region) {
      places.push(usPlace(null, region));
      continue;
    }
    const parts = segment.split(",").map((part) => part.trim());
    if (parts.length === 2 && parts[0] && /^[\p{L}][\p{L} .'-]{0,60}$/u.test(parts[0])) {
      const cityRegion = stateCode(parts[1]);
      if (cityRegion) places.push(usPlace(parts[0], cityRegion));
    }
  }
  const unique = new Map(places.map((place) => [JSON.stringify(place), place]));
  return { places: [...unique.values()].slice(0, MAX_JOB_LOCATIONS), remoteUs };
}

const SALARY_UNITS: Readonly<Record<string, string>> = Object.freeze({
  hr: "HOUR", hour: "HOUR", wk: "WEEK", week: "WEEK", mo: "MONTH", month: "MONTH", yr: "YEAR", year: "YEAR",
});

function salaryAmount(value: string, thousands: string | undefined): number | null {
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return thousands ? amount * 1_000 : amount;
}

/** Parse only clean US-dollar ranges such as "$26-$34/hr" or "$150k/yr". */
export function parseUsdSalary(compensation: string | undefined): JsonLd | null {
  const match = compensation?.trim().match(
    /^\$(\d[\d,]*(?:\.\d+)?)(k)?(?:\s*(?:-|–|—|to)\s*\$?(\d[\d,]*(?:\.\d+)?)(k)?)?\s*\/\s*(hr|hour|wk|week|mo|month|yr|year)$/i,
  );
  if (!match) return null;
  const minValue = salaryAmount(match[1], match[2]);
  const maxValue = match[3] ? salaryAmount(match[3], match[4] ?? match[2]) : minValue;
  const unitText = SALARY_UNITS[match[5].toLowerCase()];
  if (!minValue || !maxValue || maxValue < minValue || !unitText) return null;
  return {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: {
      "@type": "QuantitativeValue",
      ...(minValue === maxValue ? { value: minValue } : { minValue, maxValue }),
      unitText,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * JobPosting markup is emitted only when the page shows a verified employer
 * description, a trustworthy date and at least one unambiguous location.
 * Listings without a real description stay out of job-search rich results
 * instead of risking a structured-data policy violation for the whole site.
 */
export function jobPostingJsonLd(job: JobListItem): JsonLd | null {
  const summary = job.summary?.trim();
  const datePosted = job.postedAt ?? job.firstSeenAt;
  if (!summary || !datePosted || Number.isNaN(Date.parse(datePosted))) return null;
  const { places, remoteUs } = parseUsJobLocations(job.location);
  const remote = remoteUs && job.workplace !== "On-site";
  if (!places.length && !remote) return null;

  const requirements = job.requirements?.length
    ? `<p>Requirements:</p><ul>${job.requirements.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const validThrough = job.deadline && !Number.isNaN(Date.parse(job.deadline)) ? job.deadline : undefined;
  const baseSalary = parseUsdSalary(job.compensation);

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: `<p>${escapeHtml(summary)}</p>${requirements}`,
    datePosted,
    ...(validThrough ? { validThrough } : {}),
    employmentType: job.roleLevel === "Internship" ? "INTERN" : "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
      ...(job.companyDomain ? { sameAs: `https://${job.companyDomain}` } : {}),
    },
    identifier: {
      "@type": "PropertyValue",
      name: SITE_NAME,
      value: job.id,
    },
    ...(places.length ? { jobLocation: places } : {}),
    ...(remote
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: { "@type": "Country", name: "US" },
        }
      : {}),
    ...(baseSalary ? { baseSalary } : {}),
    directApply: false,
    url: absoluteUrl(`/jobs/${encodeURIComponent(job.id)}`),
  };
}
