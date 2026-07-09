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
  ["quant", /\bquant(itative)?\b|\btrad(er|ing)\b/i],
  ["security", /\bsecurity\b|\bcyber|\bappsec\b|\binfosec\b|penetration test/i],
  [
    "cloud",
    /\bcloud\b|\bdevops\b|\bsre\b|site reliability|\binfrastructure\b|\bplatform engineer|\bkubernetes\b|\baws\b|\bazure\b|\bgcp\b/i,
  ],
  [
    "data-ml",
    /machine learning|\bml\b|\bai\b|artificial intelligence|data scien|deep learning|computer vision|\bnlp\b|research (scientist|engineer|intern)|\bdata engineer|data analyst|analytics/i,
  ],
  [
    "hardware",
    /\bhardware\b|\bfirmware\b|\bfpga\b|\basic\b|\bsilicon\b|\bchip\b|\brf\b engineer|electrical engineer/i,
  ],
  [
    "software",
    /software|\bswe\b|\bsde\b|front.?end|back.?end|full.?stack|\bweb dev|mobile|\bios\b|\bandroid\b|\bdeveloper\b|\bprogrammer\b|\bengineer(ing)? intern\b|\bembedded\b|\bgame\b|\bqa\b|\btest engineer/i,
  ],
];

/** Map a source-provided category label to ours, if recognizable. */
function fromSourceCategory(raw: string | null | undefined): Category | null {
  if (!raw) return null;
  const c = raw.toLowerCase();
  if (c.includes("software")) return "software";
  if (c.includes("cloud") || c.includes("infra")) return "cloud";
  if (c.includes("ml") || c.includes("ai") || c.includes("data")) return "data-ml";
  if (c.includes("quant")) return "quant";
  if (c.includes("security")) return "security";
  if (c.includes("hardware")) return "hardware";
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

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "internship-tracker (github.com/UrielJMendoza)" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
