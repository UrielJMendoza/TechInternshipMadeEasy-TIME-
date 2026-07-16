import assert from "node:assert/strict";
import test from "node:test";
import {
  DENVER_LOCATION_ID,
  buildLocationFacetOptions,
  countRemoteJobs,
  getJobLocationFacetIds,
  getJobLocationSearchText,
  getLocationFacetCounts,
  getUsLocationDisplay,
  isRemoteLocation,
  matchesPhysicalLocationSelection,
} from "./jobLocations";

test("normalizes Denver variants and cautious metro aliases", () => {
  assert.deepEqual(getJobLocationFacetIds("Denver, Colorado"), [DENVER_LOCATION_ID]);
  assert.deepEqual(getJobLocationFacetIds("Denver, CO"), [DENVER_LOCATION_ID]);
  assert.deepEqual(getJobLocationFacetIds("Denver"), [DENVER_LOCATION_ID]);
  assert.deepEqual(getJobLocationFacetIds("Aurora, CO"), [DENVER_LOCATION_ID]);
  assert.deepEqual(getJobLocationFacetIds("Aurora, IL"), ["place:aurora-il"]);
});

test("detects explicit remote language but not hybrid alone", () => {
  assert.equal(isRemoteLocation("Remote - United States"), true);
  assert.equal(isRemoteLocation("Work from home"), false);
  assert.equal(isRemoteLocation("Hybrid - Denver, CO"), false);
  assert.equal(
    countRemoteJobs([
      { location: "Remote", country_code: "US" },
      { location: "Hybrid" },
    ]),
    1,
  );
});

test("multi-location jobs return all canonical physical facets with OR matching", () => {
  const location = "Remote; Denver, CO; New York, NY";
  assert.deepEqual(getJobLocationFacetIds(location), [
    DENVER_LOCATION_ID,
    "new-york-ny",
  ]);
  assert.equal(matchesPhysicalLocationSelection(location, ["chicago-il", "new-york-ny"]), true);
  assert.equal(matchesPhysicalLocationSelection(location, ["chicago-il"]), false);
  assert.equal(matchesPhysicalLocationSelection(location, []), true);
});

test("facet counts deduplicate aliases within the same job", () => {
  const counts = getLocationFacetCounts([
    { location: "Denver, CO; Aurora, CO" },
    { location: "Denver, Colorado" },
    { location: "New York, NY" },
  ]);
  assert.equal(counts[DENVER_LOCATION_ID], 2);
  assert.equal(counts["new-york-ny"], 1);
});

test("Denver is pinned and disabled at zero; remaining options support both orders", () => {
  const jobs = [
    { location: "Chicago, IL" },
    { location: "New York, NY" },
    { location: "Chicago, IL" },
  ];
  const popular = buildLocationFacetOptions(jobs, "popular");
  assert.deepEqual(popular.map((option) => option.id), [
    DENVER_LOCATION_ID,
    "chicago-il",
    "new-york-ny",
  ]);
  assert.equal(popular[0].disabled, true);
  assert.equal(popular[0].count, 0);

  const alphabetical = buildLocationFacetOptions(jobs, "alphabetical");
  assert.deepEqual(alphabetical.map((option) => option.id), [
    DENVER_LOCATION_ID,
    "chicago-il",
    "new-york-ny",
  ]);
});

test("location search text adds canonical market labels", () => {
  assert.match(getJobLocationSearchText("Aurora, CO"), /denver co/);
  assert.match(getJobLocationSearchText("Mountain View, CA"), /san francisco bay area/);
});

test("preserves popular non-canonical locations as normalized fallback facets", () => {
  const jobs = [
    { location: "San Luis Obispo, CA" },
    { location: "San Luis Obispo, California" },
    { location: "Patt AFB, OH" },
  ];
  const options = buildLocationFacetOptions(jobs, "popular");
  assert.ok(options.some((option) => option.id === "place:san-luis-obispo-ca"));
  assert.ok(options.some((option) => option.id === "place:patt-afb-oh"));
  assert.equal(
    matchesPhysicalLocationSelection("Patt AFB, OH", ["place:patt-afb-oh"]),
    true,
  );
});

test("foreign and malformed locations never become fallback facets", () => {
  const mixed = "London, UK; Chicago, IL";
  assert.deepEqual(getJobLocationFacetIds(mixed), ["chicago-il"]);
  assert.deepEqual(getJobLocationFacetIds("Amsterdam, NH"), []);
  assert.equal(getUsLocationDisplay(mixed), "Chicago, IL");
  assert.doesNotMatch(getJobLocationSearchText(mixed), /london/);

  const options = buildLocationFacetOptions(
    [
      { location: mixed },
      { location: "Amsterdam, NH" },
      { location: "Remote in Canada" },
    ],
    "popular",
  );
  assert.equal(options.some((option) => option.id === "place:london-uk"), false);
  assert.equal(options.some((option) => option.id === "place:amsterdam-nh"), false);
});

test("ambiguous Northwestern office text becomes separate safe facets", () => {
  assert.deepEqual(getJobLocationFacetIds("Chicago, Puerto Rico"), [
    "chicago-il",
    "place:puerto-rico",
  ]);
  assert.equal(
    getUsLocationDisplay("Chicago, Puerto Rico"),
    "Chicago, IL; Puerto Rico",
  );
});
