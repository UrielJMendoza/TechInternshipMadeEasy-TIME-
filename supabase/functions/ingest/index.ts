import { authorizeEdgeIngestRequest } from "./lib/edgeIngestAuth.ts";
import { INGEST_SOURCE_CHECKSUM } from "./manifest.ts";

type DenoRuntime = {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
if (!deno) throw new Error("Supabase Edge runtime is unavailable");

const MAX_BODY_BYTES = 1_024;
const TRIGGER_ORIGIN = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;

interface IngestRequestBody {
  mode?: unknown;
  source?: unknown;
  trigger?: unknown;
}

async function smallJsonBody(
  request: Request,
): Promise<IngestRequestBody | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return null;
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return {};
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;

  try {
    const decoded: unknown = JSON.parse(text);
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      return null;
    }
    const body = decoded as IngestRequestBody;
    if (
      body.mode !== undefined &&
      body.mode !== "community" &&
      body.mode !== "official"
    ) {
      return null;
    }
    if (body.source !== undefined &&
      (body.mode === "official" || typeof body.source !== "string" ||
       !["simplify", "zshah101", "zapplyjobs", "northwesternfintech", "speedyapply", "vanshb03"].includes(body.source))) return null;
    return body;
  } catch {
    return null;
  }
}

function triggerOrigin(value: unknown): string {
  if (typeof value !== "string") return "supabase-pg-cron";
  const normalized = value.trim();
  return TRIGGER_ORIGIN.test(normalized) ? normalized : "supabase-pg-cron";
}

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
    const body = await smallJsonBody(request);
    if (!body) {
      return Response.json(
        { error: "Invalid ingestion request" },
        { status: 400, headers: versionHeaders() },
      );
    }
    const { runIngest, runOfficialIngest, runSourceIngest } = await import(
      "./lib/ingest/run.ts"
    );
    const origin = triggerOrigin(body.trigger);
    const result = body.mode === "official"
      ? await runOfficialIngest(origin, INGEST_SOURCE_CHECKSUM)
      : body.source
        ? await runSourceIngest(body.source as Parameters<typeof runSourceIngest>[0], origin, INGEST_SOURCE_CHECKSUM)
        : await runIngest(origin, INGEST_SOURCE_CHECKSUM);
    return Response.json(result, { headers: versionHeaders() });
  } catch (error) {
    console.error("ingestion failed", error);
    return Response.json(
      { error: "Ingestion failed" },
      { status: 500, headers: versionHeaders() },
    );
  }
});
