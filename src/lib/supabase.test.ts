import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public database configuration accepts the documented publishable key", () => {
  const source = readFileSync(new URL("./supabase.ts", import.meta.url), "utf8");
  const publishable = source.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const legacyAnon = source.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  assert.ok(publishable >= 0);
  assert.ok(legacyAnon > publishable);
});
