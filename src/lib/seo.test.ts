import assert from "node:assert/strict";
import test from "node:test";
import {
  OG_IMAGE,
  SITE_URL,
  absoluteUrl,
  breadcrumbJsonLd,
  itemListJsonLd,
  jobPostingJsonLd,
  publicPageMetadata,
  siteIdentityJsonLd,
} from "./seo";
import type { Internship } from "./types";

const job: Internship = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Security Engineering Intern",
  company: "Example Labs",
  location: "Remote — United States",
  category: "security",
  role_type: "internship",
  season: "Fall 2026",
  salary: "$40/hr",
  link: "https://example.com/jobs/1",
  source: "fixture",
  sponsorship: "Offers visa sponsorship",
  posted_date: "2026-07-20",
  first_seen_at: "2026-07-20T12:00:00.000Z",
  last_seen_at: "2026-07-23T12:00:00.000Z",
  is_active: true,
};

test("public metadata includes canonical, robots, Open Graph, and social image data", () => {
  const metadata = publicPageMetadata({
    title: "Security roles",
    description: "Current evidence-backed security roles.",
    path: "/discover/security",
  });
  assert.deepEqual(metadata.alternates, { canonical: "/discover/security" });
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  assert.equal(metadata.openGraph?.url, "/discover/security");
  assert.deepEqual(metadata.openGraph?.images, [OG_IMAGE]);
  assert.ok(metadata.twitter && "card" in metadata.twitter);
  assert.equal(metadata.twitter?.card, "summary_large_image");
});

test("structured data uses stable internal URLs and visible breadcrumb order", () => {
  const list = itemListJsonLd("Security roles", [job], "/discover/security");
  assert.equal(list.numberOfItems, 1);
  assert.equal(
    list.itemListElement[0].url,
    `${SITE_URL}/jobs/${job.id}`,
  );
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Security", path: "/discover/security" },
  ]);
  assert.deepEqual(
    breadcrumb.itemListElement.map((item) => item.position),
    [1, 2],
  );
  assert.equal(absoluteUrl("/jobs"), `${SITE_URL}/jobs`);
});

test("site identity and legitimate detail schema stay accurately scoped", () => {
  assert.deepEqual(
    siteIdentityJsonLd().map((item) => item["@type"]),
    ["Organization", "WebSite"],
  );
  const posting = jobPostingJsonLd(job);
  assert.equal(posting["@type"], "JobPosting");
  assert.equal(posting.hiringOrganization.name, "Example Labs");
  assert.equal(posting.jobLocationType, "TELECOMMUTE");
  assert.doesNotMatch(posting.description, /endorsed|partnered|verified open/i);
});
