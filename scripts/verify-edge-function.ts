import { INGEST_SOURCE_CHECKSUM } from "../supabase/functions/ingest/manifest";

async function main(): Promise<void> {
  const baseUrl = process.env.SUPABASE_FUNCTION_URL ??
    (process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ingest`
      : null);
  if (!baseUrl) {
    throw new Error("SUPABASE_URL or SUPABASE_FUNCTION_URL is required");
  }

  const response = await fetch(baseUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 401) {
    throw new Error(`Unauthenticated Edge probe returned HTTP ${response.status}, expected 401`);
  }

  const deployedChecksum = response.headers.get("x-ingest-source-checksum");
  if (deployedChecksum !== INGEST_SOURCE_CHECKSUM) {
    throw new Error(
      `Edge checksum mismatch: deployed=${deployedChecksum ?? "missing"} reviewed=${INGEST_SOURCE_CHECKSUM}`,
    );
  }

  const expectedVersion = INGEST_SOURCE_CHECKSUM;
  const deployedVersion = response.headers.get("x-ingest-code-version");
  if (deployedVersion !== expectedVersion) {
    throw new Error(
      `Edge code version mismatch: deployed=${deployedVersion ?? "missing"} expected=${expectedVersion}`,
    );
  }

  console.log(`deployed ingestion ${deployedVersion} ${deployedChecksum}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
