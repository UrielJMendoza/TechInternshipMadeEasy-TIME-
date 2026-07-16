import { INGEST_SOURCE_CHECKSUM } from "../supabase/functions/ingest/manifest";
import { ingestArtifactChecksum } from "./ingest-artifact";

async function main(): Promise<void> {
  const current = await ingestArtifactChecksum();
  if (current !== INGEST_SOURCE_CHECKSUM) {
    throw new Error(
      "The Edge ingestion manifest is stale. Run npm run ingest:artifact:generate.",
    );
  }
  console.log(`ingestion artifact ${current}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
