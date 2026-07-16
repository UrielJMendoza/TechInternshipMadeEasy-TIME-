import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyUsLocationPart,
  getSafeUsLocationParts,
  getUsLocationDisplay,
  isUsLocationEligible,
  isUsRemoteLocation,
  sanitizeUsLocation,
} from "./usLocations";

test("uses structured state evidence without treating ordinary words as state codes", () => {
  assert.equal(classifyUsLocationPart("Amsterdam, NH"), "foreign");
  assert.equal(classifyUsLocationPart("Amsterdam, NY"), "physical");
  assert.equal(classifyUsLocationPart("Ontario, CA"), "physical");
  assert.equal(classifyUsLocationPart("Based in"), "unknown");
  assert.equal(isUsLocationEligible("Latin America"), false);
});

test("explicit foreign evidence overrides familiar US city names", () => {
  assert.equal(classifyUsLocationPart("Cambridge, UK"), "foreign");
  assert.equal(classifyUsLocationPart("Boston, UK"), "foreign");
  assert.equal(classifyUsLocationPart("Austin, Canada"), "foreign");
  assert.equal(classifyUsLocationPart("Paris, TX"), "physical");
});

test("sanitizes each multi-location part instead of accepting or rejecting the whole string", () => {
  assert.deepEqual(
    getSafeUsLocationParts("London, UK; Chicago, IL; New York, NY"),
    ["Chicago, IL", "New York, NY"],
  );
  assert.equal(
    getUsLocationDisplay("Buenos Aires, Argentina; New York, NY"),
    "New York, NY",
  );
  assert.equal(isUsLocationEligible("London, UK"), false);
});

test("remote eligibility respects its declared region", () => {
  assert.equal(isUsRemoteLocation("Remote in USA"), true);
  assert.equal(isUsLocationEligible("Remote in USA"), true);
  assert.equal(isUsRemoteLocation("Remote in Canada"), false);
  assert.equal(isUsLocationEligible("Remote in Canada"), false);
  assert.equal(isUsRemoteLocation("Remote"), false);
  assert.equal(
    isUsRemoteLocation("Remote", { allowAmbiguousRemote: true }),
    true,
  );
  for (const unsafe of [
    "Remote in Israel",
    "Remote in South Africa",
    "San Jose, Costa Rica",
    "Remote worldwide",
    "Remote anywhere",
  ]) {
    assert.equal(isUsLocationEligible(unsafe), false, unsafe);
  }
});

test("rewrites the known Chicago and Puerto Rico office-list ambiguity", () => {
  const sanitized = sanitizeUsLocation("Chicago, Puerto Rico");
  assert.deepEqual(sanitized.parts, ["Chicago, IL", "Puerto Rico"]);
  assert.equal(sanitized.display, "Chicago, IL; Puerto Rico");
  assert.equal(sanitized.eligible, true);
  assert.equal(
    getUsLocationDisplay("Chicago, NYC"),
    "Chicago, IL; New York, NY",
  );
  assert.equal(
    getUsLocationDisplay("Chicago, Austin"),
    "Chicago, IL; Austin, TX",
  );
});

test("blank locations remain quarantined at read time", () => {
  assert.deepEqual(sanitizeUsLocation(""), {
    parts: [],
    display: "",
    eligible: false,
    hasRemote: false,
  });
});
