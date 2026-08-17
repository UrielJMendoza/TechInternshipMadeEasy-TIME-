import type {
  Category,
  NormalizedJob,
  SponsorshipStatus,
} from "../types";
import { plausiblePostedTime } from "../jobTime";
import { safeExternalHttpUrl } from "../safeUrl";
import { sanitizeUsLocation } from "../usLocations";

/** Strip emoji, flag markers, markdown bold and stray whitespace. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORY_RULES: Array<[Category, RegExp]> = [
  ["quant", /\bquant(itative)?\b|\btrad(er|ing)\b|market mak(er|ing)/i],
  [
    "finance",
    /\bfinance\b|\bfinancial\b|investment bank(ing)?|asset management|wealth management|private equity|venture capital|\bequity research\b|\btreasury\b/i,
  ],
  ["consulting", /\bconsult(ing|ant)\b|advisory\b|strategy intern/i],
  ["accounting", /\baccount(ing|ant)\b|\baudit(or|ing)?\b|\btax\b/i],
  [
    "supply-chain",
    /\bsupply chain\b|\blogistics\b|\bprocurement\b|\bsourcing\b|\bdistribution\b/i,
  ],
  [
    "operations",
    /\boperations?\b|\bbusiness operations?\b|\bprocess improvement\b|\bproject management\b/i,
  ],
  [
    "product",
    /\bproduct (management|manager|strategy|operations?|marketing)\b|\bassociate product\b/i,
  ],
  ["marketing", /\bmarketing\b|\bbrand\b|\bgrowth\b|\bcommunications?\b|\bpublic relations?\b/i],
  [
    "aerospace",
    /\baerospace\b|\baeronautical\b|\bavionics\b|\bpropulsion\b|\bflight systems?\b|\bspacecraft\b/i,
  ],
  [
    "civil",
    /\bcivil (engineer|engineering)\b|\bstructural\b|\bgeotechnical\b|\bconstruction (engineering|management)\b|\btransportation engineering\b/i,
  ],
  [
    "mechanical",
    /\bmechanical\b|\bhvac\b|\bthermal\b|\bfluid systems?\b|\bmechanic(?:s|al)?\b/i,
  ],
  [
    "electrical",
    /\belectrical\b|\belectronics?\b|\bpower systems?\b|\bcontrols? engineer\b|\bembedded systems?\b/i,
  ],
  [
    "manufacturing",
    /\bmanufactur(ing|ability|e)\b|\bproduction engineer\b|\bquality engineer\b|\bprocess engineer\b/i,
  ],
  ["industrial", /\bindustrial\b|\bsystems engineering\b|\boperations research\b/i],
  ["materials", /\bmaterials?\b|\bmetallurgy\b|\bpolymer\b|\belectrochemistry\b/i],
  [
    "hardware",
    /\bhardware\b|\bfirmware\b|\bfpga\b|\basic\b|\bsilicon\b|\bchip\b|\bsemiconductor\b|\brf\b engineer/i,
  ],
  [
    "security",
    /\bsecurity\b|\bcyber\b|\bappsec\b|\binfosec\b|penetration test/i,
  ],
  [
    "cloud",
    /\bcloud\b|\bdevops\b|\bsre\b|site reliability|\binfrastructure\b|\bplatform engineer\b|\bkubernetes\b|\baws\b|\bazure\b|\bgcp\b/i,
  ],
  [
    "data-ml",
    /machine learning|\bml\b|\bai\b|artificial intelligence|data scien|deep learning|computer vision|\bnlp\b|research (scientist|engineer|intern)|\bdata engineer\b|data analyst|analytics/i,
  ],
  [
    "software",
    /software|\bswe\b|\bsde\b|front.?end|back.?end|full.?stack|\bweb dev|mobile|\bios\b|\bandroid\b|\bdeveloper\b|\bprogrammer\b|\bengineer(ing)? intern\b|\bembedded\b|\bgame\b|\bqa\b|\btest engineer/i,
  ],
];

/** Map a source-provided category label to ours, if recognizable. */
function fromSourceCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const category = raw.toLowerCase();
  if (category.includes("quant") || category.includes("trading")) return "quant";
  if (category.includes("finance") || category.includes("banking")) return "finance";
  if (category.includes("consult")) return "consulting";
  if (category.includes("account") || category.includes("audit")) return "accounting";
  if (category.includes("supply chain") || category.includes("logistics")) return "supply-chain";
  if (category.includes("operations")) return "operations";
  if (category.includes("product")) return "product";
  if (category.includes("marketing")) return "marketing";
  if (category.includes("aerospace") || category.includes("aviation")) return "aerospace";
  if (category.includes("civil") || category.includes("structural")) return "civil";
  if (category.includes("mechanical")) return "mechanical";
  if (category.includes("electrical") || category.includes("electronics")) return "electrical";
  if (category.includes("manufactur")) return "manufacturing";
  if (category.includes("industrial") || category.includes("systems")) return "industrial";
  if (category.includes("material")) return "materials";
  if (category.includes("hardware") || category.includes("firmware") || category.includes("computer engineering")) return "hardware";
  if (category.includes("security") || category.includes("cyber")) return "security";
  if (category.includes("cloud") || category.includes("infra") || category.includes("devops")) return "cloud";
  if (category.includes("ml") || category.includes("ai") || category.includes("data")) return "data-ml";
  if (category.includes("software") || category.includes("developer")) return "software";
  return null;
}

export function categorize(
  title: string,
  sourceCategory?: string | null,
  hint?: Category | null,
): Category {
  // The title is the most specific signal; check it first so e.g. a
  // "Cloud Infrastructure Intern" filed under "Software" upstream lands in cloud.
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(title)) return cat;
  }
  return fromSourceCategory(sourceCategory) ?? hint ?? "other";
}

function slug(s: string): string {
  return cleanText(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Legal suffixes are safe to remove. Product or industry words are not: for
// example, "Acme Labs" and "Acme" may be different employers.
const COMPANY_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "corp", "corporation", "co", "company",
  "ltd", "limited", "plc", "gmbh", "sa", "ag",
]);

const COMPANY_ALIASES: Record<string, string> = {
  "alphabet": "google",
  "alphabet-google": "google",
  "facebook": "meta",
  "meta-platforms": "meta",
  "amazon-web-services": "amazon",
  "aws": "amazon",
  "jpmorgan-chase": "jpmorgan",
  "jp-morgan": "jpmorgan",
  "jp-morgan-chase": "jpmorgan",
  "the-walt-disney-company": "disney",
};

export function canonicalCompanyIdentity(company: string): string {
  const tokens = slug(company).split("-");
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  const normalized = tokens.join("-");
  return COMPANY_ALIASES[normalized] ?? normalized;
}

export function normalizedTitle(title: string): string {
  return slug(
    title
      .replace(/\b(req(?:uisition)?|job)\s*(?:id|#|no\.?)?\s*[:#-]?\s*[a-z]*\d[\w-]*\b/gi, " ")
      .replace(/\b(summer|fall|spring|winter)\b/gi, " ")
      .replace(/\b20\d{2}\b/g, " "),
  );
}

const GEO_ALIASES: Record<string, string> = {
  "new york city": "new york",
  nyc: "new york",
  manhattan: "new york",
  sf: "san francisco",
  "san francisco bay area": "san francisco",
  "washington dc": "washington",
  "washington d c": "washington",
};

const GEO_DROP = new Set([
  "us", "usa", "u s", "u s a", "united states", "united states of america",
  "america", "north america", "canada", "can", "uk", "united kingdom", "remote",
  "hybrid", "onsite", "multiple locations",
  // states — abbreviations
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il",
  "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt",
  "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri",
  "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc",
  // states — full names
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming",
]);

export function normalizedLocation(location: string): string {
  // First listed location only — sources disagree on how many they list.
  const first = location.split(";")[0].split("+")[0].replace(/[()]/g, ",");
  const segments = first
    .split(/[,\-\/·]/)
    .map((s) =>
      cleanText(s).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim(),
    )
    .filter(Boolean)
    .map((s) => GEO_ALIASES[s] ?? s);
  const cities = segments.filter((s) => !GEO_DROP.has(s));
  // "New York, New York" drops everything — fall back to the first segment.
  return slug(cities.join(" ")) || slug(segments[0] ?? "") || "anywhere";
}

export function dedupeKey(company: string, title: string, location: string): string {
  return `${canonicalCompanyIdentity(company)}|${normalizedTitle(title)}|${normalizedLocation(location)}`;
}

const TRACKING_PARAMS = new Set([
  "ref",
  "src",
  "source",
  "sourceid",
  "source_id",
  "referrer",
  "referral",
  "lever-source",
  "gh_src",
  "gh_jid_source",
  "campaign",
  "campaignid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

const LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

/**
 * Produce a clean application destination while preserving parameters that
 * may identify the requisition. Known ATS detail/apply and locale variants are
 * collapsed only when the resulting URL remains a valid job page.
 */
export function canonicalizeApplicationUrl(url: string): string {
  const safeUrl = safeExternalHttpUrl(url);
  if (!safeUrl) return "";

  try {
    const u = new URL(safeUrl);

    for (const p of [...u.searchParams.keys()]) {
      if (isTrackingParam(p)) u.searchParams.delete(p);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");

    const segments = u.pathname.split("/").filter(Boolean);
    const hostname = u.hostname;

    if (
      hostname === "boards.greenhouse.io" ||
      hostname === "job-boards.greenhouse.io"
    ) {
      u.hostname = "job-boards.greenhouse.io";
      if (segments.at(-1)?.toLowerCase() === "apply") segments.pop();
      u.pathname = `/${segments.map((part, index) => index === 0 ? part.toLowerCase() : part).join("/")}`;
    } else if (hostname === "jobs.lever.co") {
      if (segments.at(-1)?.toLowerCase() === "apply") segments.pop();
      u.pathname = `/${segments.map((part, index) => index === 0 ? part.toLowerCase() : part).join("/")}`;
    } else if (hostname === "jobs.ashbyhq.com") {
      if (segments.at(-1)?.toLowerCase() === "application") segments.pop();
      u.pathname = `/${segments.map((part, index) => index === 0 ? part.toLowerCase() : part).join("/")}`;
    } else if (hostname.endsWith(".myworkdayjobs.com")) {
      const withoutLocale = segments.filter(
        (part, index) => !(index === 0 && LOCALE_SEGMENT.test(part)),
      );
      u.pathname = `/${withoutLocale.join("/")}`;
    }

    u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    u.searchParams.sort();
    return u.toString().replace(/\?$/, "");
  } catch {
    return "";
  }
}

/** Backward-compatible adapter name. */
export function cleanLink(url: string): string {
  return canonicalizeApplicationUrl(url);
}

export function applicationUrlKey(link: string): string {
  try {
    const u = new URL(canonicalizeApplicationUrl(link));
    const knownAts =
      u.hostname === "job-boards.greenhouse.io" ||
      u.hostname === "jobs.lever.co" ||
      u.hostname === "jobs.ashbyhq.com" ||
      u.hostname.endsWith(".myworkdayjobs.com");
    const path = knownAts ? u.pathname.toLowerCase() : u.pathname;
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return link.trim();
  }
}

const EXTERNAL_ID_QUERY_KEYS = [
  "gh_jid",
  "job_id",
  "jobid",
  "jobId",
  "postingId",
  "positionId",
];
const REQUISITION_QUERY_KEYS = [
  "requisitionId",
  "requisition_id",
  "reqId",
  "req_id",
];

function cleanIdentifier(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/[^a-z0-9._-]/gi, "");
  return cleaned && cleaned.length >= 3 ? cleaned.toLowerCase() : null;
}

export function extractJobIdentifiers(link: string, title = ""): {
  externalJobId: string | null;
  requisitionId: string | null;
} {
  let externalJobId: string | null = null;
  let requisitionId: string | null = null;

  try {
    const u = new URL(link);
    for (const key of EXTERNAL_ID_QUERY_KEYS) {
      externalJobId ??= cleanIdentifier(u.searchParams.get(key));
    }
    for (const key of REQUISITION_QUERY_KEYS) {
      requisitionId ??= cleanIdentifier(u.searchParams.get(key));
    }

    const parts = u.pathname.split("/").filter(Boolean);
    if (/greenhouse\.io$/i.test(u.hostname)) {
      const jobsIndex = parts.findIndex((part) => part.toLowerCase() === "jobs");
      externalJobId ??= cleanIdentifier(jobsIndex >= 0 ? parts[jobsIndex + 1] : null);
    } else if (/jobs\.lever\.co$/i.test(u.hostname)) {
      externalJobId ??= cleanIdentifier(parts[1]);
    } else if (/jobs\.ashbyhq\.com$/i.test(u.hostname)) {
      externalJobId ??= cleanIdentifier(parts[1]);
    } else if (/\.myworkdayjobs\.com$/i.test(u.hostname)) {
      const workdayId = u.pathname.match(/[_/-]([a-z]{0,4}\d{3,}[a-z0-9-]*)\/?$/i)?.[1];
      requisitionId ??= cleanIdentifier(workdayId);
    }
  } catch {
    // Invalid URLs remain usable as display values but supply no identity.
  }

  const titleReq = title.match(
    /\b(?:req(?:uisition)?|job)\s*(?:id|#|no\.?)?\s*[:#-]?\s*([a-z]{0,4}\d{3,}[a-z0-9-]*)\b/i,
  )?.[1];
  requisitionId ??= cleanIdentifier(titleReq);

  return { externalJobId, requisitionId };
}

function hashIdentity(input: string): string {
  const fnv = (value: string, seed: number): string => {
    let hash = seed;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36).padStart(7, "0");
  };
  let reversed = "";
  for (let index = input.length - 1; index >= 0; index -= 1) {
    reversed += input[index];
  }
  return `${fnv(input, 0x811c9dc5)}${fnv(reversed, 0x9e3779b9)}`;
}

function sponsorshipEvidence(value: string | null): {
  status: SponsorshipStatus;
  confidence: number | null;
} {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return { status: "unknown", confidence: null };
  if (/citizen|clearance|work authorization restriction/.test(normalized)) {
    return { status: "restricted", confidence: 1 };
  }
  if (/does not|no[- ]sponsorship|not sponsor|without sponsorship/.test(normalized)) {
    return { status: "not-offered", confidence: 1 };
  }
  if (/offers?|sponsor|h-?1b|visa/.test(normalized)) {
    return { status: "confirmed", confidence: 1 };
  }
  return { status: "unknown", confidence: null };
}

function enrichTrustFields(job: NormalizedJob): NormalizedJob | null {
  const canonicalUrl = canonicalizeApplicationUrl(job.link);
  if (!canonicalUrl) return null;

  const canonicalCompany = canonicalCompanyIdentity(job.company);
  const title = normalizedTitle(job.title);
  const location = normalizedLocation(job.location);
  const identifiers = extractJobIdentifiers(canonicalUrl, job.title);
  const sponsorship = sponsorshipEvidence(job.sponsorship);
  const urlKey = applicationUrlKey(canonicalUrl);
  const postingIdentity =
    job.posted_date && !identifiers.externalJobId && !identifiers.requisitionId
      ? `${canonicalCompany}|${title}|${location}|${job.posted_date}`
      : null;
  const strongestIdentity =
    (identifiers.requisitionId
      ? `req|${canonicalCompany}|${identifiers.requisitionId}`
      : null) ??
    (identifiers.externalJobId
      ? `external|${canonicalCompany}|${identifiers.externalJobId}`
      : null) ??
    (urlKey ? `url|${urlKey}` : null) ??
    (postingIdentity ? `posting|${postingIdentity}` : null) ??
    `source|${job.source}|${canonicalCompany}|${title}|${location}`;
  const canonicalRecordKey = `job_${hashIdentity(strongestIdentity)}`;

  return {
    ...job,
    link: canonicalUrl,
    canonical_company: canonicalCompany,
    canonical_url: canonicalUrl,
    external_job_id: identifiers.externalJobId,
    requisition_id: identifiers.requisitionId,
    normalized_title: title,
    normalized_location: location,
    content_fingerprint: job.content_fingerprint ?? null,
    verification_status: "source-observed",
    pay_evidence: job.salary?.trim() ? "employer-listed" : "unknown",
    sponsorship_status: sponsorship.status,
    sponsorship_source:
      sponsorship.status === "unknown" ? null : job.source,
    sponsorship_confidence: sponsorship.confidence,
    duplicate_group: `dup_${hashIdentity(strongestIdentity)}`,
    canonical_record_key: canonicalRecordKey,
    dedupe_key: canonicalRecordKey,
  };
}

/**
 * Dedupe across sources; the first occurrence (by given source order) wins.
 * Two passes: identical apply URL is always the same job regardless of how
 * the sources phrased it, then the normalized company|title|location key
 * catches re-posts that use different tracking URLs.
 */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byLink = new Map<string, NormalizedJob>();
  const byExternalId = new Map<string, NormalizedJob>();
  const byRequisition = new Map<string, NormalizedJob>();
  const byFingerprint = new Map<string, NormalizedJob>();
  const byPostingIdentity = new Map<string, NormalizedJob>();
  const out: NormalizedJob[] = [];

  const merge = (into: NormalizedJob, from: NormalizedJob) => {
    into.salary ??= from.salary;
    into.season ??= from.season;
    into.sponsorship ??= from.sponsorship;
    into.posted_date ??= from.posted_date;
    into.content_fingerprint ??= from.content_fingerprint;
  };

  for (const input of jobs) {
    const job = enrichTrustFields(input);
    if (!job) continue;

    const company = job.canonical_company!;
    const link = applicationUrlKey(job.canonical_url!);
    const externalKey = job.external_job_id
      ? `${company}|${job.external_job_id}`
      : null;
    const requisitionKey = job.requisition_id
      ? `${company}|${job.requisition_id}`
      : null;
    const fingerprintKey = job.content_fingerprint
      ? `${company}|${job.content_fingerprint}`
      : null;
    const postingKey =
      job.posted_date && !externalKey && !requisitionKey
        ? `${company}|${job.normalized_title}|${job.normalized_location}|${job.posted_date}`
        : null;

    const linkMatch = byLink.get(link);
    const conflictingExternalIds =
      linkMatch?.external_job_id &&
      job.external_job_id &&
      linkMatch.external_job_id !== job.external_job_id;
    const conflictingRequisitionIds =
      linkMatch?.requisition_id &&
      job.requisition_id &&
      linkMatch.requisition_id !== job.requisition_id;
    const compatibleLinkMatch =
      conflictingExternalIds || conflictingRequisitionIds
        ? undefined
        : linkMatch;
    const existing =
      compatibleLinkMatch ??
      (externalKey ? byExternalId.get(externalKey) : undefined) ??
      (requisitionKey ? byRequisition.get(requisitionKey) : undefined) ??
      (fingerprintKey ? byFingerprint.get(fingerprintKey) : undefined) ??
      (postingKey ? byPostingIdentity.get(postingKey) : undefined);
    if (existing) {
      merge(existing, job);
      continue;
    }
    byLink.set(link, job);
    if (externalKey) byExternalId.set(externalKey, job);
    if (requisitionKey) byRequisition.set(requisitionKey, job);
    if (fingerprintKey) byFingerprint.set(fingerprintKey, job);
    if (postingKey) byPostingIdentity.set(postingKey, job);
    out.push(job);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Post-parse filters: the board only lists USA roles posted in the last ~4
// months. Rows filtered out here also age out of the DB automatically — the
// upsert deactivates anything absent from the batch.

export const MAX_AGE_DAYS = 120;

function isRecent(posted: string | null, now: number): boolean {
  if (!posted) return true; // no date — let first_seen aging handle it
  const t = plausiblePostedTime(posted, now);
  if (t === null) return false;
  return now - t <= MAX_AGE_DAYS * 86_400_000;
}

/** USA-only, posted within the last MAX_AGE_DAYS. */
export function applyPostFilters(
  jobs: NormalizedJob[],
  now = Date.now(),
): NormalizedJob[] {
  return jobs.flatMap((job) => {
    if (!isRecent(job.posted_date, now)) return [];

    const sanitized = sanitizeUsLocation(job.location);
    if (!sanitized.eligible) return [];

    const location = sanitized.display;
    const normalized = enrichTrustFields({
      ...job,
      location,
    });
    return normalized ? [normalized] : [];
  });
}
