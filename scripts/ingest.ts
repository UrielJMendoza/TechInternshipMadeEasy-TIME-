// Standalone ingestion runner: `npm run ingest`
// Fetches all sources, normalizes, dedupes and upserts into Supabase.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env.local loader so the script runs outside Next.js.
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  // fine — rely on the ambient environment
}

import("../src/lib/ingest/run").then(async ({ runIngest }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is not set");
  const result = await runIngest(secret);
  console.log(JSON.stringify(result, null, 2));
});
