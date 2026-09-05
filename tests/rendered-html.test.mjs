import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { brotliCompressSync, gzipSync } from "node:zlib";

async function render(pathname = "/") {
  const workerUrl = new URL(process.env.TIMLEY_TEST_ARTIFACT === "vercel" ? "../.vercel/output/functions/__server.func/index.mjs" : "../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function htmlFor(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, `${pathname} should render successfully`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

test("homepage renders the focused account-free product and bespoke sharing metadata", async () => {
  const html = await htmlFor("/");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const homepageJobs = (html.match(/\/jobs\/job_[a-f0-9]+/g) ?? []).length;
  const homepageLogos = (html.match(/class="company-logo company-logo-row"/g) ?? []).length;
  const popularCompanyLogos = (html.match(/class="company-logo company-logo-rail"/g) ?? []).length;
  const popularCompanyDomains = [...html.matchAll(
    /class="company-logo company-logo-rail" aria-hidden="true" data-company-domain="([^"]+)"/g,
  )].map((match) => match[1]);

  assert.match(html, /Internships and new-grad jobs, newest first/);
  assert.match(html, /Search jobs/);
  assert.match(html, /<form(?=[^>]*class="home-search")(?=[^>]*action="\/jobs")(?=[^>]*method="get")(?=[^>]*role="search")[^>]*>/);
  assert.match(html, /<input(?=[^>]*name="q")(?=[^>]*type="search")(?=[^>]*placeholder="Search title, company, location, or keyword")[^>]*>/);
  assert.match(html, /Browse all jobs/);
  assert.match(html, /Newest listings/);
  assert.match(html, /4,416/);
  assert.match(html, /https:\/\/timley\.dev\/og\.png/);
  assert.match(html, /<link rel="canonical" href="https:\/\/timley\.dev"\/>/);
  assert.match(html, /Companies with recent postings/);
  assert.match(html, />Pause logos<\/button>/);
  assert.doesNotMatch(html, /Companies students are watching/);
  assert.doesNotMatch(html, /TIMLEY INDEX \/ NEWEST FIRST|9\/9 sources healthy/);
  assert.doesNotMatch(html, /Modeled on public sources|Duplicates removed|Reference listings model/);
  assert.doesNotMatch(html, /href="\/sources"|class="source-code"|>via\s/);
  assert.doesNotMatch(html, /[–—]/, "the homepage should avoid long dash punctuation");
  assert.ok(homepageJobs > 0 && homepageJobs <= 6, "the homepage should render its newest jobs");
  assert.equal(homepageLogos, homepageJobs, "every homepage job should render its company logo");
  assert.equal(popularCompanyLogos, 60, "the homepage rail should loop 30 real company logos");
  assert.equal(new Set(popularCompanyDomains).size, 30, "the homepage rail should show more than 24 distinct companies");
  assert.equal((html.match(/href="\/jobs\?company=/g) ?? []).length, 60, "both seamless rail copies should keep every visible company clickable");
  assert.match(css, /\.company-rail-track\s*\{[^}]*animation:\s*company-logo-loop 80s linear infinite/s);
  assert.match(css, /\.company-rail-track\.is-paused\s*\{[^}]*animation-play-state:\s*paused/s);
  assert.doesNotMatch(css, /company-rail-window:hover/);
  for (const color of ["#67d391", "#add66f", "#e4bd56", "#ed8b5a", "#f27d7d"]) {
    assert.match(css, new RegExp(`--recency-color:\\s*${color}`));
  }
  assert.match(html, /https:\/\/favicon\.vemetric\.com\//);
  assert.match(
    html,
    /<a(?=[^>]*class="brand")(?=[^>]*href="\/")(?=[^>]*aria-label="Timley home")[^>]*>Timley<\/a>/,
  );
  assert.doesNotMatch(html, /company-emoji|class="company-mark|tone-(?:lilac|mint|ink|sand|sky|rose)/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
  assert.doesNotMatch(html, />\s*(?:Account|Tracker|Alerts)\s*</i);
});

test("jobs HTML contains one 36-job server page and stays below the payload ceiling", async (t) => {
  const html = await htmlFor("/jobs");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rawBytes = Buffer.byteLength(html);
  const gzipBytes = gzipSync(html).byteLength;
  const brotliBytes = brotliCompressSync(html).byteLength;
  const detailLinks = [...html.matchAll(/\/jobs\/(job_[a-f0-9]+)/g)].map((match) => match[1]);
  const uniqueDetailLinks = new Set(detailLinks);

  assert.equal(uniqueDetailLinks.size, 36, "only the first 36 job records should be serialized");
  assert.match(html, /Results load 36 at a time/);
  const companyGroupCount = (html.match(/class="company-job-group"/g) ?? []).length;
  assert.ok(companyGroupCount > 0 && companyGroupCount <= 36);
  assert.equal(
    (html.match(/aria-controls="company-group-[0-9]+-jobs"/g) ?? []).length,
    companyGroupCount,
    "each visible company section should have its own collapse control",
  );
  assert.match(html, /<button class="mobile-filter-toggle"[^>]*aria-expanded="false"[^>]*><span>Filters \((?:<!-- -->)?0(?:<!-- -->)?\)<\/span>/);
  assert.match(css, /\.advanced-filters\.is-open\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.more-menu\s*\{\s*position:\s*static/s);
  assert.doesNotMatch(
    css,
    /\.mobile-filter-toggle\s*\{[^}]*position:\s*(?:fixed|sticky)/s,
    "the mobile filter disclosure must stay in normal document flow",
  );
  assert.doesNotMatch(html, /Employer posting dates stay separate from discovery dates|Old backfills never appear as new jobs|Newest first · No category boosts/);
  assert.match(html, /4,416(?:<!-- -->)? matching opportunities/);
  assert.match(html, /<span class="field-label">Major<\/span>/);
  assert.match(html, /<span class="field-label">Specialization<\/span>/);
  assert.match(html, />Computer Science<\/option>/);
  assert.match(html, />Engineering<\/option>/);
  assert.match(html, />Business<\/option>/);
  assert.doesNotMatch(html, /class="source-code"|>via\s|<span>Source<\/span>|All sources/);
  assert.equal(
    (html.match(/class="recency recency-(?:newest|fresh|recent|aging|old)"/g) ?? []).length,
    36,
    "every feed row should show a color-coded recency label",
  );
  assert.match(html, /<time[^>]*>(?:Posted|Found by Timley) (?:just now|today|yesterday|[0-9]+ (?:minute|hour|day|month|year)s? ago)<\/time><\/strong>/);
  assert.doesNotMatch(html, /<time[^>]*>(?:Just now|[0-9]+ (?:minute|hour|day|month|year)s? ago)<\/time>/);
  assert.doesNotMatch(html, /[–—]/, "the jobs feed should avoid long dash punctuation");
  assert.match(html, /class="apply" href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer"/);
  assert.equal(
    (html.match(/class="company-logo company-logo-row"/g) ?? []).length,
    36,
    "every server-rendered feed row should include its company logo",
  );
  assert.match(html, /data-company-domain="(?:stripe\.com|figma\.com|notion\.so|linear\.app)"/);
  assert.doesNotMatch(html, /company-emoji|class="company-mark|tone-(?:lilac|mint|ink|sand|sky|rose)/);
  assert.doesNotMatch(html, /Sponsorship unknown|estimated salary/i);
  assert.doesNotMatch(html, /Compensation not listed/);
  assert.ok(brotliBytes < 150 * 1024, `Brotli payload is ${brotliBytes} bytes`);

  t.diagnostic(`jobs payload: ${rawBytes} B raw · ${gzipBytes} B gzip · ${brotliBytes} B Brotli`);
});

test("shareable filters server-render their active state without a cursor", async () => {
  const html = await htmlFor("/jobs?level=internship&q=software&major=computer-science&niche=software-engineering&remote=true");

  assert.match(html, /Filtered jobs/);
  assert.match(html, /value="software"/);
  assert.match(html, /value="computer-science" selected=""/);
  assert.match(html, /value="software-engineering" selected=""/);
  assert.match(html, /href="\/jobs\?q=software&amp;major=computer-science&amp;niche=software-engineering&amp;remote=true"/);
  assert.match(html, /<span>Filters \((?:<!-- -->)?3(?:<!-- -->)?\)<\/span>/);
  assert.doesNotMatch(html, /cursor=/);
});

test("job details keep the filtered return path and reject external return targets", async () => {
  const jobs = await htmlFor("/jobs?q=software&remote=true");
  const detailHref = jobs.match(
    /href="(\/jobs\/job_[a-f0-9]+\?returnTo=[^"]+)"/,
  )?.[1]?.replaceAll("&amp;", "&");
  assert.ok(detailHref, "a filtered feed card should include a return path");

  const detail = await htmlFor(detailHref);
  assert.match(
    detail,
    /class="back-link" href="\/jobs\?q=software&amp;remote=true#listing-job_[a-f0-9]+"/,
  );
  assert.match(detail, /Back to job results/);

  const jobId = detailHref.match(/\/jobs\/(job_[a-f0-9]+)/)?.[1];
  assert.ok(jobId);
  for (const unsafeReturnPath of [
    "https://evil.example/jobs",
    "//evil.example/jobs",
    "/\\\\evil.example/jobs",
    "/account",
  ]) {
    const unsafeDetail = await htmlFor(
      `/jobs/${jobId}?returnTo=${encodeURIComponent(unsafeReturnPath)}`,
    );
    assert.match(unsafeDetail, /class="back-link" href="\/jobs"/);
    assert.doesNotMatch(unsafeDetail, /class="back-link" href="[^"]*evil\.example/);
  }
});

test("the old sources route leaves the UI and saved jobs remain local", async () => {
  const [sources, saved] = await Promise.all([
    render("/sources"),
    htmlFor("/saved"),
  ]);

  assert.ok([307, 308].includes(sources.status));
  assert.match(sources.headers.get("location") ?? "", /\/how-it-works#sources$/);

  assert.match(saved, /<h1>Saved jobs<\/h1>/);
  assert.match(saved, /stored only in this browser/i);
  assert.match(saved, /Your saved list and notes are stored only in this browser/);
  assert.match(saved, /<meta name="robots" content="noindex, follow"\/>/);
  assert.match(saved, /<link rel="canonical" href="https:\/\/timley\.dev\/saved"\/>/);
});

test("crawl metadata stays canonical and missing routes return a real 404", async () => {
  const [jobs, robotsResponse, sitemapResponse, missingJob, missingPage] = await Promise.all([
    htmlFor("/jobs?q=software"),
    render("/robots.txt"),
    render("/sitemap.xml"),
    render("/jobs/job_missing"),
    render("/definitely-missing"),
  ]);

  assert.match(jobs, /<link rel="canonical" href="https:\/\/timley\.dev\/jobs"\/>/);

  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get("content-type") ?? "", /^text\/plain\b/i);
  const robots = await robotsResponse.text();
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/timley\.dev\/sitemap\.xml/);

  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get("content-type") ?? "", /^application\/xml\b/i);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<loc>https:\/\/timley\.dev<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/timley\.dev\/jobs<\/loc>/);
  assert.doesNotMatch(sitemap, /\/saved<\/loc>/);

  for (const response of [missingJob, missingPage]) {
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.match(html, /We couldn’t find that page/);
    assert.match(html, /<meta name="robots" content="noindex"\/>/);
  }
});

test("job details use record-specific metadata and clear the site-wide image", async () => {
  const jobsHtml = await htmlFor("/jobs");
  const firstJobId = jobsHtml.match(/\/jobs\/(job_[a-f0-9]+)/)?.[1];
  const feedLogoDomain = jobsHtml.match(
    /class="company-logo company-logo-row" aria-hidden="true" data-company-domain="([^"]+)"/,
  )?.[1];
  assert.ok(firstJobId, "the feed should expose a detail route");
  assert.ok(feedLogoDomain, "the first feed row should expose a real company logo domain");

  const detail = await htmlFor(`/jobs/${firstJobId}`);
  const title = detail.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
  const visibleTitle = detail.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? "";
  const detailLogoDomain = detail.match(
    /class="company-logo company-logo-detail" aria-hidden="true" data-company-domain="([^"]+)"/,
  )?.[1];

  assert.ok(title.includes(visibleTitle));
  assert.match(detail, new RegExp(`<link rel="canonical" href="https://timley\\.dev/jobs/${firstJobId}"`));
  assert.equal(detailLogoDomain, feedLogoDomain, "detail should retain the feed's company logo mapping");
  assert.equal(
    (detail.match(/class="company-logo company-logo-detail"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(detail, /company-emoji/);
  assert.match(detail, /Apply now/);
  assert.match(detail, /Employer website/);
  assert.match(detail, /Listing details/);
  assert.match(detail, /<span>Date source<\/span><strong>(?:First observed by Timley|Verified employer date|Source-reported date)<\/strong>/);
  assert.match(detail, /<span>Feed last checked<\/span><strong><time dateTime="[^"]+">[^<]+UTC<\/time><\/strong>/);
  assert.match(detail, /Timley does not have compensation data for this listing|The listing source reports the compensation shown here/);
  assert.doesNotMatch(detail, /is hiring for this early-career/);
  assert.match(detail, /<span>Recency<\/span><strong class="recency recency-(?:newest|fresh|recent|aging|old)"/);
  assert.doesNotMatch(detail, /Source details|Primary source|Contributing sources/);
  assert.match(detail, /class="apply" href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(detail, /property="og:image"|name="twitter:image"/);
});
