import assert from "node:assert/strict";
import test from "node:test";
import { safeExternalHttpUrl } from "./safeUrl";

test("external destinations allow only absolute credential-free HTTP URLs", () => {
  assert.equal(
    safeExternalHttpUrl(" https://Careers.Example.com/jobs/123 "),
    "https://careers.example.com/jobs/123",
  );
  assert.equal(
    safeExternalHttpUrl("http://careers.example.com/jobs/123"),
    "http://careers.example.com/jobs/123",
  );

  for (const unsafe of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "ftp://careers.example.com/job",
    "//careers.example.com/job",
    "https://user:secret@careers.example.com/job",
    "https://careers.example.com/jobs/12\n3",
    "not a URL",
    "",
    null,
  ]) {
    assert.equal(safeExternalHttpUrl(unsafe), null);
  }
});
