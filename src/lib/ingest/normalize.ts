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

export function dedupeKey(company: string, title: string, location: string): string {
  return `${slug(company)}|${slug(title)}|${slug(location)}`;
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

/** Dedupe across sources; the first occurrence (by given source order) wins. */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    const existing = seen.get(job.dedupe_key);
    if (!existing) {
      seen.set(job.dedupe_key, job);
    } else {
      // Merge details a later source may know that the first didn't.
      existing.salary ??= job.salary;
      existing.season ??= job.season;
      existing.sponsorship ??= job.sponsorship;
      existing.posted_date ??= job.posted_date;
    }
  }
  return [...seen.values()];
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "internship-tracker (github.com/UrielJMendoza)" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
