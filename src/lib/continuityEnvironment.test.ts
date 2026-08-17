import assert from "node:assert/strict";
import test from "node:test";
import { hasConfiguredContinuity } from "./continuityEnvironment";

test("continuity loads globally only for an explicit complete configuration", () => {
  assert.equal(hasConfiguredContinuity({}), false);
  assert.equal(
    hasConfiguredContinuity({
      NEXT_PUBLIC_CONTINUITY_PROVIDER: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    }),
    false,
  );
  assert.equal(
    hasConfiguredContinuity({
      NEXT_PUBLIC_CONTINUITY_PROVIDER: " supabase ",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public",
    }),
    true,
  );
  assert.equal(
    hasConfiguredContinuity({
      NEXT_PUBLIC_CONTINUITY_PROVIDER: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-key",
    }),
    true,
  );
});
