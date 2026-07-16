import { authorizeEdgeIngestRequest } from "../../../src/lib/edgeIngestAuth.ts";
import { INGEST_SOURCE_CHECKSUM } from "./manifest.ts";

type DenoRuntime = {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
if (!deno) throw new Error("Supabase Edge runtime is unavailable");

function versionHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-ingest-code-version": INGEST_SOURCE_CHECKSUM,
    "x-ingest-source-checksum": INGEST_SOURCE_CHECKSUM,
  };
}

deno.serve(async (request) => {
  // Keep authorization before the dynamic ingestion import. An invalid request
  // cannot import an adapter or start an upstream fetch.
  if (!(await authorizeEdgeIngestRequest(request))) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: versionHeaders() },
    );
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 204, headers: versionHeaders() });
  }
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { ...versionHeaders(), allow: "POST, HEAD" } },
    );
  }

  try {
    const { runIngest } = await import("../../../src/lib/ingest/run.ts");
    const result = await runIngest("supabase-pg-cron", INGEST_SOURCE_CHECKSUM);
    return Response.json(result, { headers: versionHeaders() });
  } catch (error) {
    console.error("ingestion failed", error);
    return Response.json(
      { error: "Ingestion failed" },
      { status: 500, headers: versionHeaders() },
    );
  }
});
