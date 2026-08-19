import type {
  Category,
  JobSourceObservation,
  NormalizedJob,
  NormalizationConfidence,
  SourceCompensation,
  SourceId,
  StructuredLocation,
} from "../types.ts";
import { fetchFeedText } from "./fetch.ts";
import { normalizeStructuredLocation, normalizeLocationText } from "./location.ts";
import { SOURCE_REGISTRY } from "./sourceRegistry.ts";
import {
  UNKNOWN_TERM_KEY,
  sortTermKeys,
  termKeysFromValues,
} from "../jobTerms.ts";

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

// Only unambiguous legal entity suffixes are removed. Words such as Capital,
// Management, Trading, Labs, Space, and Industries carry company identity and
// must not collapse distinct employers.
const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "corp",
  "corporation",
  "ltd",
  "limited",
  "plc",
]);

function companyKey(company: string): string {
  const tokens = slug(company).split("-");
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join("-");
}

const SHARED_APPLICATION_HOSTS = new Set([
  "ashbyhq",
  "greenhouse",
  "lever",
  "myworkdayjobs",
  "smartrecruiters",
  "workable",
]);

/**
 * Accept a logo domain only when the application host itself provides strong,
 * exact company evidence. ATS/shared hosts and approximate name matches stay
 * null so the UI falls back to a letter avatar.
 */
export function companyDomainFromApplicationUrl(
  company: string,
  applicationUrl: string,
): string | null {
  const safeUrl = cleanLink(applicationUrl);
  if (!safeUrl) return null;
  const hostname = new URL(safeUrl).hostname.toLowerCase();
  const labels = hostname.split(".");
  if (labels.length < 2) return null;

  const usesCompoundSuffix =
    labels.at(-1)?.length === 2 &&
    ["ac", "co", "com", "net", "org"].includes(labels.at(-2) ?? "");
  const companyLabelIndex = usesCompoundSuffix ? labels.length - 3 : labels.length - 2;
  if (companyLabelIndex < 0) return null;

  const companyLabel = labels[companyLabelIndex];
  if (SHARED_APPLICATION_HOSTS.has(companyLabel)) return null;
  const normalizedCompany = companyKey(company).replace(/-/g, "");
  const normalizedDomain = companyLabel.replace(/-/g, "");
  if (!normalizedCompany || normalizedCompany !== normalizedDomain) return null;

  return labels.slice(companyLabelIndex).join(".");
}

function titleKey(title: string): string {
  // Season, year, and requisition cues distinguish real postings. Fuzzy
  // matching may score them separately later, but the compatibility key must
  // not erase them and turn a candidate match into primary identity.
  return slug(title);
}

function locationKey(location: string): string {
  const normalized = normalizeStructuredLocation(location);
  const parts = normalized.locations
    .map((part) =>
      [
        part.country_code ?? "unknown",
        part.region_code ?? "unknown",
        normalizeLocationText(part.city ?? part.raw_location),
        part.location_type,
      ].join(":"),
    )
    .filter(Boolean)
    .sort();
  return slug(parts.join("|")) || "anywhere";
}

export function dedupeKey(company: string, title: string, location: string): string {
  return `${companyKey(company)}|${titleKey(title)}|${locationKey(location)}`;
}

export const MAX_APPLICATION_URL_LENGTH = 2_048;

function validHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || hostname.endsWith(".")) return false;
  // Application links are never fetched by ingestion, but accepting literal IPs
  // makes host validation needlessly permissive and can expose unsafe links in
  // downstream clients. Source listings are expected to use public DNS names.
  if (/^\d+(?:\.\d+){3}$/.test(hostname)) return false;
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

/** Validate and canonicalize an untrusted application URL. */
export function cleanLink(url: string): string {
  if (!url || url.length > MAX_APPLICATION_URL_LENGTH) return "";
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !validHostname(u.hostname)
    ) {
      return "";
    }
    for (const p of [...u.searchParams.keys()]) {
      if (p.startsWith("utm_") || p === "ref" || p === "src") u.searchParams.delete(p);
    }
    return u.toString().replace(/\?$/, "");
  } catch {
    return "";
  }
}

function linkKey(link: string): string {
  try {
    const safe = cleanLink(link);
    if (!safe) return "";
    const u = new URL(safe);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return "";
  }
}

export function externalIdFromUrl(link: string): string | null {
  const safe = cleanLink(link);
  if (!safe) return null;
  const url = new URL(safe);
  for (const key of ["gh_jid", "job_id", "jobId", "req", "reqId", "requisitionId"]) {
    const value = url.searchParams.get(key);
    if (value && /^[a-z0-9][a-z0-9._-]{2,127}$/i.test(value)) return value;
  }
  const segments = url.pathname.split("/").filter(Boolean).reverse();
  return (
    segments.find((segment) => /^[a-z0-9][a-z0-9._-]{3,127}$/i.test(segment)) ??
    null
  );
}

export function requisitionIdFrom(
  title: string,
  explicit: string | null | undefined,
  link: string,
): string | null {
  const supplied = cleanText(explicit ?? "");
  if (supplied && /^[a-z0-9][a-z0-9._-]{2,127}$/i.test(supplied)) return supplied;
  const fromTitle = title.match(
    /\b(?:req(?:uisition)?(?:\s+id)?|job\s+id)\s*[:#-]?\s*([a-z0-9][a-z0-9._-]{2,127})\b/i,
  )?.[1];
  return fromTitle ?? externalIdFromUrl(link);
}

const ISO_POSTED_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
const MAX_FUTURE_POST_DAYS = 7;

export function normalizePostedDate(
  value: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!value) return null;
  const input = value.trim();
  if (!ISO_POSTED_DATE.test(input)) return null;
  const parsedInput = Date.parse(input);
  if (!Number.isFinite(parsedInput)) return null;
  const date = input.slice(0, 10);
  const time = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(time)) return null;
  if (new Date(time).toISOString().slice(0, 10) !== date) return null;
  if (time > now + MAX_FUTURE_POST_DAYS * 86_400_000) return null;
  return date;
}

export function postedDateFromUnixSeconds(
  seconds: number | null | undefined,
  now = Date.now(),
): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return null;
  const time = seconds * 1_000;
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return null;
  return normalizePostedDate(date.toISOString(), now);
}

const MISSING_COMPENSATION =
  /^(?:n\/?a|none|not available|not disclosed|competitive|competitive pay|tbd|unknown|-|—)$/i;

function currencyFrom(raw: string): string | null {
  if (/\bCAD\b/i.test(raw)) return "CAD";
  if (/\bEUR\b/i.test(raw) || raw.includes("€")) return "EUR";
  if (/\bGBP\b/i.test(raw) || raw.includes("£")) return "GBP";
  if (/\bUSD\b/i.test(raw) || raw.includes("$")) return "USD";
  return null;
}

function cadenceFrom(raw: string): SourceCompensation["cadence"] | null {
  if (/\b(?:per\s*)?(?:hour|hourly|hr|hrs)\b|\/\s*(?:h|hr)\b/i.test(raw)) {
    return "hourly";
  }
  if (/\b(?:per\s*)?(?:month|monthly|mo)\b|\/\s*mo\b/i.test(raw)) {
    return "monthly";
  }
  if (/\b(?:per\s*)?(?:year|yearly|annual|annually|annum|yr)\b|\/\s*yr\b/i.test(raw)) {
    return "annual";
  }
  return null;
}

interface CompensationNumber {
  value: number;
  index: number;
}

function compensationNumbers(raw: string): number[] {
  const pattern =
    /(^|[^a-z0-9$€£])((?:USD|CAD|EUR|GBP)\s*)?([$€£])?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.\d+)?)\s*([kK])?(?![a-z0-9])/gi;
  const candidates: CompensationNumber[] = [];
  for (const match of raw.matchAll(pattern)) {
    const value =
      Number(match[4].replace(/,/g, "")) * (match[5] ? 1_000 : 1);
    const explicit = Boolean(match[2] || match[3] || match[5]);
    // A season/year suffix is metadata, not a second end of a salary range.
    if (!explicit && value >= 1_900 && value <= 2_100) continue;
    if (!Number.isFinite(value) || value < 0) continue;
    candidates.push({
      value,
      index: (match.index ?? 0) + (match[1]?.length ?? 0),
    });
  }

  const cadenceMarker = raw.search(
    /\b(?:per\s*)?(?:hour|hourly|hr|hrs|month|monthly|mo|year|yearly|annual|annually|annum|yr)\b|\/\s*(?:h|hr|mo|yr)\b/i,
  );
  const beforeCadence =
    cadenceMarker < 0
      ? []
      : candidates.filter((candidate) => candidate.index <= cadenceMarker);
  const relevant = beforeCadence.length > 0 ? beforeCadence : candidates;
  return relevant.slice(0, 2).map((candidate) => candidate.value);
}

function annualize(value: number, cadence: SourceCompensation["cadence"]): number {
  if (cadence === "hourly") return value * 2_080;
  if (cadence === "monthly") return value * 12;
  return value;
}

export function parseSourceCompensation(
  value: string | null | undefined,
): SourceCompensation | null {
  const raw = cleanText(value ?? "").slice(0, 1_000);
  if (!raw || MISSING_COMPENSATION.test(raw)) return null;
  const cadence = cadenceFrom(raw);
  const numbers = compensationNumbers(raw).slice(0, 2);
  if (!cadence || numbers.length === 0) return null;
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  const currency = currencyFrom(raw) ?? "USD";
  const explicitCurrency = currencyFrom(raw) !== null;
  const confidence: NormalizationConfidence = explicitCurrency ? "high" : "low";
  return {
    currency,
    minimum,
    maximum,
    cadence,
    annualized_minimum: annualize(minimum, cadence),
    annualized_maximum: annualize(maximum, cadence),
    raw_text: raw,
    parse_confidence: confidence,
    provenance: "source-listed",
  };
}

/** Only confident USD source-listed pay is comparable for salary sorting. */
export function comparableAnnualCompensation(value: string | null): number {
  const parsed = parseSourceCompensation(value);
  return parsed?.currency === "USD" && parsed.parse_confidence === "high"
    ? parsed.annualized_maximum
    : 0;
}

function sourceId(value: string): SourceId | null {
  return value in SOURCE_REGISTRY ? (value as SourceId) : null;
}

function sourceHomepage(source: string): string {
  const id = sourceId(source);
  return id ? SOURCE_REGISTRY[id].homepage : "";
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function persistedTermKeys(
  provided: NormalizedJob["term_keys"],
  evidence: readonly string[],
) {
  return sortTermKeys([
    ...(provided ?? []),
    ...termKeysFromValues(evidence),
  ]).filter((key) => key !== UNKNOWN_TERM_KEY);
}

function observationFor(job: NormalizedJob): JobSourceObservation {
  const safeLink = cleanLink(job.link);
  const compensation = job.compensation ?? parseSourceCompensation(job.salary);
  const requisitionId = requisitionIdFrom(
    job.raw_title ?? job.title,
    job.requisition_id,
    safeLink,
  );
  return {
    source: job.source,
    external_id: job.external_id ?? externalIdFromUrl(safeLink),
    raw_title: job.raw_title ?? job.title,
    raw_location: job.raw_location ?? job.location,
    source_url: job.source_url ?? sourceHomepage(job.source),
    apply_url: safeLink,
    season: job.season,
    term_keys: persistedTermKeys(job.term_keys, [
      job.season ?? "",
      job.raw_title ?? job.title,
    ]),
    requisition_id: requisitionId,
    posted_date: job.posted_date,
    locations: job.locations ?? [],
    compensation,
  };
}

function preparedJob(job: NormalizedJob): NormalizedJob {
  const observations = job.observations?.length
    ? job.observations.map((observation) => ({
        ...observation,
        term_keys: persistedTermKeys(observation.term_keys, [
          observation.season ?? "",
          observation.raw_title,
        ]),
      }))
    : [observationFor(job)];
  const compensation = job.compensation ?? parseSourceCompensation(job.salary);
  const requisitionId = requisitionIdFrom(
    job.raw_title ?? job.title,
    job.requisition_id,
    job.link,
  );
  return {
    ...job,
    salary: compensation?.raw_text ?? null,
    compensation,
    contributing_sources: uniqueStrings([
      ...(job.contributing_sources ?? []),
      job.source,
    ]),
    observations,
    seasons: uniqueStrings([...(job.seasons ?? []), job.season]),
    term_keys: persistedTermKeys(job.term_keys, [
      job.season ?? "",
      job.raw_title ?? job.title,
    ]),
    requisition_id: requisitionId,
    requisition_ids: uniqueStrings([
      ...(job.requisition_ids ?? []),
      requisitionId,
    ]),
    locations: (job.locations ?? []).map((location) => ({ ...location })),
  };
}

function latestPostedDate(
  first: string | null,
  second: string | null,
): string | null {
  const left = normalizePostedDate(first);
  const right = normalizePostedDate(second);
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function locationIdentity(location: StructuredLocation): string {
  return [
    normalizeLocationText(location.raw_location),
    location.country_code,
    location.region_code,
    location.location_type,
  ].join("|");
}

function mergeJobs(into: NormalizedJob, from: NormalizedJob): void {
  const intoComp = into.compensation;
  const fromComp = from.compensation;
  if (
    !intoComp ||
    (intoComp.parse_confidence !== "high" && fromComp?.parse_confidence === "high")
  ) {
    into.compensation = fromComp ?? intoComp ?? null;
    into.salary = into.compensation?.raw_text ?? into.salary ?? from.salary;
  }
  into.season ??= from.season;
  into.sponsorship ??= from.sponsorship;
  into.posted_date = latestPostedDate(into.posted_date, from.posted_date);
  into.contributing_sources = uniqueStrings([
    ...(into.contributing_sources ?? []),
    ...(from.contributing_sources ?? []),
    from.source,
  ]);
  into.seasons = uniqueStrings([...(into.seasons ?? []), ...(from.seasons ?? [])]);
  into.term_keys = sortTermKeys([
    ...(into.term_keys ?? []),
    ...(from.term_keys ?? []),
  ]);
  into.requisition_ids = uniqueStrings([
    ...(into.requisition_ids ?? []),
    ...(from.requisition_ids ?? []),
  ]);

  const observationKeys = new Set(
    (into.observations ?? []).map(
      (observation) =>
        `${observation.source}|${observation.external_id ?? ""}|${observation.apply_url}`,
    ),
  );
  for (const observation of from.observations ?? []) {
    const key = `${observation.source}|${observation.external_id ?? ""}|${observation.apply_url}`;
    if (!observationKeys.has(key)) {
      observationKeys.add(key);
      into.observations?.push(observation);
    }
  }

  const locationKeys = new Set((into.locations ?? []).map(locationIdentity));
  for (const location of from.locations ?? []) {
    const key = locationIdentity(location);
    if (!locationKeys.has(key)) {
      locationKeys.add(key);
      into.locations?.push(location);
    }
  }
}

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent !== index) this.parents[index] = this.find(parent);
    return this.parents[index];
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}

/**
 * Dedupe across sources; the first occurrence (by given source order) wins.
 * Two passes: identical apply URL is always the same job regardless of how
 * the sources phrased it, then the normalized company|title|location key
 * catches re-posts that use different tracking URLs.
 */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const prepared = jobs.map(preparedJob);
  const groups = new DisjointSet(prepared.length);
  const byLink = new Map<string, number>();
  const byKey = new Map<string, number>();

  prepared.forEach((job, index) => {
    const link = linkKey(job.link);
    const linkMatch = link ? byLink.get(link) : undefined;
    const keyMatch = job.dedupe_key ? byKey.get(job.dedupe_key) : undefined;
    if (linkMatch !== undefined) groups.union(index, linkMatch);
    if (keyMatch !== undefined) groups.union(index, keyMatch);
    if (link) byLink.set(link, index);
    if (job.dedupe_key) byKey.set(job.dedupe_key, index);
  });

  const merged = new Map<number, NormalizedJob>();
  prepared.forEach((job, index) => {
    const root = groups.find(index);
    const existing = merged.get(root);
    if (existing) mergeJobs(existing, job);
    else merged.set(root, job);
  });
  return [...merged.values()];
}

// ---------------------------------------------------------------------------
// Post-parse filters: the board only lists USA roles posted in the last ~4
// months. Rows filtered out here also age out of the DB automatically — the
// upsert deactivates anything absent from the batch.

export const MAX_AGE_DAYS = 120;

function isRecent(posted: string | null, now: number): boolean {
  if (!posted) return true; // no date — let first_seen aging handle it
  const normalized = normalizePostedDate(posted, now);
  if (!normalized) return false;
  const t = new Date(`${normalized}T00:00:00Z`).getTime();
  return now - t <= MAX_AGE_DAYS * 86_400_000;
}

/** USA-only, posted within the last MAX_AGE_DAYS. */
export function applyPostFilters(
  jobs: NormalizedJob[],
  now = Date.now(),
): NormalizedJob[] {
  return jobs.flatMap((job) => {
    if (!isRecent(job.posted_date, now)) return [];
    const link = cleanLink(job.link);
    if (!link) return [];

    const normalizedLocation = normalizeStructuredLocation(
      job.raw_location ?? job.location,
      { sourceUsOnly: job.source_us_only ?? false },
    );
    if (!normalizedLocation.eligible) return [];

    const location = normalizedLocation.display;
    const compensation = parseSourceCompensation(job.salary);
    const postedDate = normalizePostedDate(job.posted_date, now);
    const termKeys = persistedTermKeys(job.term_keys, [
      job.season ?? "",
      job.raw_title ?? job.title,
    ]);
    const enriched: NormalizedJob = {
      ...job,
      raw_title: job.raw_title ?? job.title,
      raw_location: job.raw_location ?? job.location,
      source_url: job.source_url ?? sourceHomepage(job.source),
      external_id: job.external_id ?? externalIdFromUrl(link),
      requisition_id: requisitionIdFrom(
        job.raw_title ?? job.title,
        job.requisition_id,
        link,
      ),
      link,
      salary: compensation?.raw_text ?? null,
      compensation,
      term_keys: termKeys,
      posted_date: postedDate,
      location,
      locations: normalizedLocation.locations,
      dedupe_key: dedupeKey(job.company, job.title, location),
      contributing_sources: uniqueStrings([
        ...(job.contributing_sources ?? []),
        job.source,
      ]),
    };
    enriched.seasons = uniqueStrings([...(job.seasons ?? []), enriched.season]);
    enriched.requisition_ids = uniqueStrings([
      ...(job.requisition_ids ?? []),
      enriched.requisition_id,
    ]);
    enriched.observations = [observationFor(enriched)];
    return [
      enriched,
    ];
  });
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetchFeedText(url, {
    expectedContentTypes: ["application/json", "text/plain", "text/markdown"],
  });
  return response.text;
}
