import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FOLLOWED_COMPANIES,
  parseFollowedCompanies,
  serializeFollowedCompanies,
  toggleFollowedCompany,
} from "./followedCompanies";

test("followed companies parse as a bounded, sorted, versioned slug set", () => {
  const raw = JSON.stringify({
    version: 1,
    slugs: ["zeta-labs", "acme", "acme", "../private", "", 42],
  });
  assert.deepEqual(parseFollowedCompanies(raw), ["acme", "zeta-labs"]);
  assert.deepEqual(
    parseFollowedCompanies(serializeFollowedCompanies(["zeta-labs", "acme"])),
    ["acme", "zeta-labs"],
  );
  assert.deepEqual(parseFollowedCompanies('{"version":2,"slugs":["acme"]}'), []);
});

test("follow toggles are deterministic and refuse unsafe or over-limit input", () => {
  assert.deepEqual(toggleFollowedCompany(["acme"], "zeta-labs"), [
    "acme",
    "zeta-labs",
  ]);
  assert.deepEqual(toggleFollowedCompany(["acme"], "acme"), []);
  assert.deepEqual(toggleFollowedCompany(["acme"], "../private"), ["acme"]);

  const full = Array.from(
    { length: MAX_FOLLOWED_COMPANIES },
    (_, index) => `company-${index}`,
  );
  assert.equal(toggleFollowedCompany(full, "one-more").length, full.length);
});
