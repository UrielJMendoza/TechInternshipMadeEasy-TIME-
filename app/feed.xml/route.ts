import { JOB_MAJOR_OPTIONS, buildJobsUrl, parseFilters, queryJobs } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";
import { SITE_URL } from "@/lib/site";

function xml(value: string): string {
  return Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code === 9 || code === 10 || code === 13 ||
      (code >= 32 && code <= 0xD7FF) ||
      (code >= 0xE000 && code <= 0xFFFD) ||
      (code >= 0x10000 && code <= 0x10FFFF);
  }).join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const category = url.searchParams.get("category")?.trim().toLowerCase();
  if (category) {
    // A short RSS alias for the existing jobs-page specialization filter.
    const niche = category === "software" ? "software-engineering" : category;
    const major = JOB_MAJOR_OPTIONS.find((option) =>
      option.id !== "all" && option.niches.some((choice) => choice.id === niche),
    );
    if (major) {
      filters.major = major.id;
      filters.niche = niche;
    } else {
      filters.q = category.slice(0, 120);
    }
  }

  try {
    const snapshot = await getPublicJobsSnapshot();
    const page = queryJobs(filters, { limit: 60, snapshot });
    const jobsUrl = new URL(buildJobsUrl(filters), SITE_URL).toString();
    const items = page.items.map((job) => {
      const link = `${SITE_URL}/jobs/${encodeURIComponent(job.id)}`;
      const description = [job.location, job.roleLevel, job.summary].filter(Boolean).join(" · ");
      return [
        "<item>",
        `<title>${xml(`${job.title} at ${job.company}`)}</title>`,
        `<link>${xml(link)}</link>`,
        `<guid isPermaLink="true">${xml(link)}</guid>`,
        `<pubDate>${new Date(job.firstSeenAt ?? page.asOf).toUTCString()}</pubDate>`,
        `<description>${xml(description)}</description>`,
        "</item>",
      ].join("");
    }).join("");
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"><channel>',
      `<title>${xml(category ? `Timley jobs: ${category}` : "Timley jobs")}</title>`,
      `<link>${xml(jobsUrl)}</link>`,
      "<description>Current internships and new-grad roles from Timley.</description>",
      `<lastBuildDate>${new Date(page.asOf).toUTCString()}</lastBuildDate>`,
      items,
      "</channel></rss>",
    ].join("");
    return new Response(body, {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return new Response("Feed temporarily unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
