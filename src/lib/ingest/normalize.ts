import type { Category, NormalizedJob } from "../types";

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
    /\bcivil\b|\bstructural\b|\bgeotechnical\b|\bconstruction (engineering|management)\b|\btransportation engineering\b/i,
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

// The same job appears across sources with cosmetic differences ("Varda" vs
// "Varda Space", "San Mateo, CA" vs "San Mateo, California, United States",
// "(Fall 2026)" vs "- Fall 2026"). The dedupe key aggressively normalizes all
// three parts; display fields keep the original text.

const COMPANY_SUFFIXES = new Set([
  "inc", "llc", "corp", "co", "ltd", "plc", "company", "corporation",
  "capital", "management", "trading", "group", "holdings", "partners",
  "technologies", "technology", "labs", "space", "industries",
]);

function companyKey(company: string): string {
  const tokens = slug(company).split("-");
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join("-");
}

function titleKey(title: string): string {
  return slug(
    title
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

function locationKey(location: string): string {
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
  return `${companyKey(company)}|${titleKey(title)}|${locationKey(location)}`;
}

/** Drop the tracking params some lists append to apply URLs. */
export function cleanLink(url: string): string {
  try {
    const u = new URL(url);
    for (const p of [...u.searchParams.keys()]) {
      if (p.startsWith("utm_") || p === "ref" || p === "src") u.searchParams.delete(p);
    }
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
}

function linkKey(link: string): string {
  try {
    const u = new URL(link);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return link;
  }
}

/**
 * Dedupe across sources; the first occurrence (by given source order) wins.
 * Two passes: identical apply URL is always the same job regardless of how
 * the sources phrased it, then the normalized company|title|location key
 * catches re-posts that use different tracking URLs.
 */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byLink = new Map<string, NormalizedJob>();
  const byKey = new Map<string, NormalizedJob>();
  const out: NormalizedJob[] = [];

  const merge = (into: NormalizedJob, from: NormalizedJob) => {
    into.salary ??= from.salary;
    into.season ??= from.season;
    into.sponsorship ??= from.sponsorship;
    into.posted_date ??= from.posted_date;
  };

  for (const job of jobs) {
    const link = linkKey(job.link);
    const existing = byLink.get(link) ?? byKey.get(job.dedupe_key);
    if (existing) {
      merge(existing, job);
      continue;
    }
    byLink.set(link, job);
    byKey.set(job.dedupe_key, job);
    out.push(job);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Post-parse filters: the board only lists USA roles posted in the last ~4
// months. Rows filtered out here also age out of the DB automatically — the
// upsert deactivates anything absent from the batch.

export const MAX_AGE_DAYS = 120;

const US_TOKENS = new Set([
  "us", "usa", "america", "remote",
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il",
  "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt",
  "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri",
  "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc",
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "hampshire", "jersey",
  "york", "carolina", "dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "wisconsin", "wyoming",
]);

const US_CITY_NAMES = [
  "nyc",
  "new york",
  "chicago",
  "boston",
  "austin",
  "seattle",
  "dallas",
  "houston",
  "atlanta",
  "miami",
  "denver",
  "phoenix",
  "detroit",
  "pittsburgh",
  "philadelphia",
  "san francisco",
  "san jose",
  "los angeles",
  "san diego",
  "long beach",
  "mountain view",
  "palo alto",
  "bellevue",
  "redmond",
  "cambridge",
  "minneapolis",
  "nashville",
  "charlotte",
  "raleigh",
  "baltimore",
  "portland",
  "salt lake city",
  "columbus",
  "cincinnati",
  "indianapolis",
  "milwaukee",
  "madison",
  "cleveland",
  "tampa",
  "orlando",
];

function isUSA(location: string): boolean {
  const loc = location
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!loc) return true; // no location info — keep, sources are US-centric
  const tokens = loc.split(" ");
  const usSignal =
    tokens.some((t) => US_TOKENS.has(t)) || loc.includes("united states");
  // Keep remote listings from the USA-focused sources, but require a US signal
  // for physical locations so unknown international places cannot slip through.
  return usSignal || US_CITY_NAMES.some((city) => loc.includes(city)) || loc.includes("remote");
}

function isRecent(posted: string | null, now: number): boolean {
  if (!posted) return true; // no date — let first_seen aging handle it
  const t = new Date(`${posted}T00:00:00Z`).getTime();
  return now - t <= MAX_AGE_DAYS * 86_400_000;
}

/** USA-only, posted within the last MAX_AGE_DAYS. */
export function applyPostFilters(jobs: NormalizedJob[]): NormalizedJob[] {
  const now = Date.now();
  return jobs.filter((j) => isRecent(j.posted_date, now) && isUSA(j.location));
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "internship-tracker (github.com/UrielJMendoza)" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
