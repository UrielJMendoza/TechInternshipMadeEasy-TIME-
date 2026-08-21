import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { brotliCompressSync, gzipSync } from "node:zlib";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
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
  assert.match(html, /Browse jobs/);
  assert.match(html, /Newest listings/);
  assert.match(html, /4,416/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /Companies students are watching|Pause logos|Play logos/);
  assert.doesNotMatch(html, /TIMLEY INDEX \/ NEWEST FIRST|9\/9 sources healthy/);
  assert.doesNotMatch(html, /Modeled on public sources|Duplicates removed|Reference listings model/);
  assert.doesNotMatch(html, /href="\/sources"|class="source-code"|>via\s/);
  assert.doesNotMatch(html, /[–—]/, "the homepage should avoid long dash punctuation");
  assert.ok(homepageJobs > 0 && homepageJobs <= 6, "the homepage should render its newest jobs");
  assert.equal(homepageLogos, homepageJobs, "every homepage job should render its company logo");
  assert.equal(popularCompanyLogos, 60, "the homepage rail should loop 30 real company logos");
  assert.equal(new Set(popularCompanyDomains).size, 30, "the homepage rail should show more than 24 distinct companies");
  assert.match(css, /\.company-rail-track\s*\{[^}]*animation:\s*company-logo-loop 80s linear infinite/s);
  assert.doesNotMatch(css, /company-rail-window:hover|animation-play-state:\s*paused|company-rail-track\.is-paused/);
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
  const rawBytes = Buffer.byteLength(html);
  const gzipBytes = gzipSync(html).byteLength;
  const brotliBytes = brotliCompressSync(html).byteLength;
  const detailLinks = [...html.matchAll(/\/jobs\/(job_[a-f0-9]+)/g)].map((match) => match[1]);
  const uniqueDetailLinks = new Set(detailLinks);

  assert.equal(uniqueDetailLinks.size, 36, "only the first 36 job records should be serialized");
  assert.match(html, /Results load 36 at a time/);
  assert.doesNotMatch(html, /Employer posting dates stay separate from discovery dates|Old backfills never appear as new jobs|Newest first · No category boosts/);
  assert.match(html, /4,416(?:<!-- -->)? matching opportunities/);
  assert.match(html, /<span class="field-label">Major<\/span>/);
  assert.match(html, /<span class="field-label">Specialization<\/span>/);
  assert.match(html, />Computer Science<\/option>/);
  assert.match(html, />Engineering<\/option>/);
  assert.match(html, />Business<\/option>/);
  assert.doesNotMatch(html, /class="source-code"|>via\s|<span>Source<\/span>|All sources/);
  assert.doesNotMatch(html, /[–—]/, "the jobs feed should avoid long dash punctuation");
  assert.match(html, /href="https:\/\/example\.com\/\?job=tl-[0-9]+"/);
  assert.equal(
    (html.match(/class="company-logo company-logo-row"/g) ?? []).length,
    36,
    "every server-rendered feed row should include its company logo",
  );
  assert.match(html, /data-company-domain="(?:stripe\.com|figma\.com|notion\.so|linear\.app)"/);
  assert.doesNotMatch(html, /company-emoji|class="company-mark|tone-(?:lilac|mint|ink|sand|sky|rose)/);
  assert.doesNotMatch(html, /Sponsorship unknown|estimated salary/i);
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
  assert.doesNotMatch(html, /cursor=/);
});

test("the old sources route leaves the UI and saved jobs remain local", async () => {
  const [sources, saved] = await Promise.all([
    render("/sources"),
    htmlFor("/saved"),
  ]);

  assert.ok([307, 308].includes(sources.status));
  assert.match(sources.headers.get("location") ?? "", /\/jobs$/);

  assert.match(saved, /<h1>Saved jobs<\/h1>/);
  assert.match(saved, /Stored only in this browser/);
  assert.match(saved, /Nothing is uploaded/);
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
  assert.equal(detailLogoDomain, feedLogoDomain, "detail should retain the feed's company logo mapping");
  assert.equal(
    (detail.match(/class="company-logo company-logo-detail"/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(detail, /company-emoji/);
  assert.match(detail, /Apply now/);
  assert.match(detail, /Employer website/);
  assert.match(detail, /Listing details/);
  assert.doesNotMatch(detail, /Source details|Primary source|Contributing sources/);
  assert.match(detail, /https:\/\/example\.com\/\?job=tl-[0-9]+/);
  assert.doesNotMatch(detail, /property="og:image"|name="twitter:image"/);
});
