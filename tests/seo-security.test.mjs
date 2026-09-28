import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

async function moduleUrl(path, replacements = {}) {
  let source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), "utf8"));
  for (const [specifier, url] of Object.entries(replacements)) {
    source = source.replaceAll(`from "${specifier}";`, `from "${url}";`);
  }
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const siteUrl = await moduleUrl("../lib/site.ts");
const structuredData = await import(await moduleUrl("../lib/seo/structured-data.ts", { "@/lib/site": siteUrl }));
const guards = await import(await moduleUrl("../lib/http/request-guards.ts"));

async function loadPublicConfig(env) {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  const assign = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  assign("NEXT_PUBLIC_SUPABASE_URL", env.url);
  assign("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env.key);
  try {
    return await import(`${await moduleUrl("../lib/supabase/public-config.ts")}#${Math.random()}`);
  } finally {
    assign("NEXT_PUBLIC_SUPABASE_URL", previous.url);
    assign("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previous.key);
  }
}

const baseJob = {
  id: "job_0123456789abcdef",
  company: "Notion",
  companyDomain: "notion.so",
  title: "Software Engineer Intern",
  location: "San Francisco, CA",
  roleLevel: "Internship",
  workplace: "On-site",
  summary: "Build collaborative product features with the editor team.",
  requirements: ["Pursuing a BS in Computer Science"],
  compensation: "$50–$60/hr",
  postedAt: "2026-09-20",
  firstSeenAt: "2026-09-20T12:00:00.000Z",
};

test("JSON-LD serialization cannot close its script element", () => {
  const serialized = structuredData.serializeJsonLd({
    title: "</script><script>alert(1)</script> & <!-- \u2028",
  });
  assert.doesNotMatch(serialized, /<|>|&|\u2028/);
  assert.equal(
    JSON.parse(serialized).title,
    "</script><script>alert(1)</script> & <!-- \u2028",
  );
});

test("site structured data names the site and its search entry point", () => {
  const data = structuredData.siteJsonLd();
  const website = data["@graph"].find((node) => node["@type"] === "WebSite");
  const organization = data["@graph"].find((node) => node["@type"] === "Organization");
  assert.equal(website.url, "https://timley.dev");
  assert.equal(website.potentialAction.target.urlTemplate, "https://timley.dev/jobs?q={search_term_string}");
  assert.equal(organization.logo.url, "https://timley.dev/icon-512.png");
});

test("breadcrumbs use absolute URLs in order", () => {
  const data = structuredData.breadcrumbJsonLd([
    { name: "Timley", path: "/" },
    { name: "Jobs", path: "/jobs" },
  ]);
  assert.deepEqual(
    data.itemListElement.map((item) => [item.position, item.item]),
    [[1, "https://timley.dev/"], [2, "https://timley.dev/jobs"]],
  );
});

test("only unambiguous US locations become structured job locations", () => {
  const regions = (location) => structuredData.parseUsJobLocations(location).places
    .map((place) => [place.address.addressLocality ?? null, place.address.addressRegion ?? null]);

  assert.deepEqual(regions("San Jose, CA"), [["San Jose", "CA"]]);
  assert.deepEqual(regions("Seattle, WA +8"), [["Seattle", "WA"]]);
  assert.deepEqual(regions("Fremont, California, United States"), [["Fremont", "CA"]]);
  assert.deepEqual(regions("Austin, TX; New York"), [["Austin", "TX"], [null, "NY"]]);
  assert.deepEqual(regions("United States"), [[null, null]]);
  assert.deepEqual(regions("LA"), [], "a bare two-letter code is usually a city, not a state");
  assert.deepEqual(regions("Washington"), [], "a bare Washington may mean DC");
  assert.deepEqual(regions("London, England, New York, New York"), []);
  assert.deepEqual(regions("Toronto, ON"), []);
  assert.equal(structuredData.parseUsJobLocations("Remote in USA").remoteUs, true);
  assert.equal(structuredData.parseUsJobLocations("USA - Remote").remoteUs, true);
  assert.equal(structuredData.parseUsJobLocations("Remote").remoteUs, true);
});

test("salary parsing accepts clean USD ranges and rejects everything else", () => {
  assert.deepEqual(structuredData.parseUsdSalary("$26–$34/hr").value, {
    "@type": "QuantitativeValue", minValue: 26, maxValue: 34, unitText: "HOUR",
  });
  assert.deepEqual(structuredData.parseUsdSalary("$150k/yr").value, {
    "@type": "QuantitativeValue", value: 150_000, unitText: "YEAR",
  });
  assert.deepEqual(structuredData.parseUsdSalary("$120k-$150k/yr").value, {
    "@type": "QuantitativeValue", minValue: 120_000, maxValue: 150_000, unitText: "YEAR",
  });
  for (const value of [undefined, "Competitive", "€50/hr", "$60", "$90-$60/hr", "$0/hr"]) {
    assert.equal(structuredData.parseUsdSalary(value), null, String(value));
  }
});

test("JobPosting markup requires a verified description and a real location", () => {
  const posting = structuredData.jobPostingJsonLd(baseJob);
  assert.equal(posting["@type"], "JobPosting");
  assert.equal(posting.employmentType, "INTERN");
  assert.equal(posting.directApply, false);
  assert.equal(posting.datePosted, "2026-09-20");
  assert.equal(posting.hiringOrganization.sameAs, "https://notion.so");
  assert.equal(posting.jobLocation[0].address.addressLocality, "San Francisco");
  assert.equal(posting.baseSalary.value.maxValue, 60);
  assert.match(posting.description, /<li>Pursuing a BS in Computer Science<\/li>/);
  assert.equal(posting.url, "https://timley.dev/jobs/job_0123456789abcdef");

  const escaped = structuredData.jobPostingJsonLd({ ...baseJob, summary: "<b>Build</b> & ship" });
  assert.match(escaped.description, /&lt;b&gt;Build&lt;\/b&gt; &amp; ship/);

  const remote = structuredData.jobPostingJsonLd({ ...baseJob, location: "Remote in USA", workplace: "Remote" });
  assert.equal(remote.jobLocationType, "TELECOMMUTE");
  assert.equal(remote.applicantLocationRequirements.name, "US");
  assert.equal(remote.jobLocation, undefined);

  assert.equal(structuredData.jobPostingJsonLd({ ...baseJob, summary: undefined }), null);
  assert.equal(structuredData.jobPostingJsonLd({ ...baseJob, summary: "   " }), null);
  assert.equal(structuredData.jobPostingJsonLd({ ...baseJob, location: "Toronto, ON" }), null);
  assert.equal(
    structuredData.jobPostingJsonLd({ ...baseJob, location: "Remote in USA", workplace: "On-site" }),
    null,
    "an on-site role with only a remote label has no trustworthy location",
  );
});

test("state-changing API guards reject cross-site and non-JSON requests", () => {
  const request = (headers) => new Request("https://timley.dev/api/saved/refresh", { method: "POST", headers });
  assert.equal(guards.isCrossSiteRequest(request({ origin: "https://timley.dev" })), false);
  assert.equal(guards.isCrossSiteRequest(request({})), false);
  assert.equal(guards.isCrossSiteRequest(request({ origin: "https://evil.example" })), true);
  assert.equal(guards.isCrossSiteRequest(request({ "sec-fetch-site": "cross-site" })), true);
  assert.equal(guards.isCrossSiteRequest(request({ "sec-fetch-site": "same-origin" })), false);

  assert.equal(guards.hasJsonContentType(request({ "content-type": "application/json" })), true);
  assert.equal(guards.hasJsonContentType(request({ "content-type": "Application/JSON; charset=utf-8" })), true);
  assert.equal(guards.hasJsonContentType(request({ "content-type": "text/plain" })), false);
  assert.equal(guards.hasJsonContentType(request({ "content-type": "application/x-www-form-urlencoded" })), false);
  assert.equal(guards.hasJsonContentType(request({})), false);
});

test("the public Supabase reader refuses privileged keys and unsafe URLs", async () => {
  const jwt = (claims) => [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
  const defaults = await loadPublicConfig({});
  assert.match(defaults.SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
  assert.equal(defaults.SUPABASE_URL, "https://ogkocdharscqzdrnlpnq.supabase.co");

  const custom = await loadPublicConfig({ url: "https://example.supabase.co/", key: "sb_publishable_custom" });
  assert.equal(custom.SUPABASE_URL, "https://example.supabase.co");
  assert.equal(custom.SUPABASE_PUBLISHABLE_KEY, "sb_publishable_custom");

  const anon = jwt({ role: "anon" });
  assert.equal((await loadPublicConfig({ key: anon })).SUPABASE_PUBLISHABLE_KEY, anon);

  for (const key of ["sb_secret_do_not_use", jwt({ role: "service_role" }), "not-a-key"]) {
    assert.equal((await loadPublicConfig({ key })).SUPABASE_PUBLISHABLE_KEY, defaults.SUPABASE_PUBLISHABLE_KEY);
  }
  for (const url of ["http://example.supabase.co", "https://user:pass@example.supabase.co", "not a url"]) {
    assert.equal((await loadPublicConfig({ url })).SUPABASE_URL, defaults.SUPABASE_URL);
  }
});
