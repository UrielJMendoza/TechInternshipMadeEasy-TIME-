import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IngestRunner = (origin: string) => Promise<unknown>;

async function defaultRunner(origin: string) {
  // Authentication is intentionally complete before this import. An invalid
  // request cannot initialize or invoke any source adapter.
  const { runIngest } = await import("@/lib/ingest/run");
  return runIngest(origin);
}

export function createIngestHandler(run: IngestRunner = defaultRunner) {
  return async function handle(request: Request) {
    if (!(await authorizeCronRequest(request))) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    try {
      const result = await run("vercel-manual");
      return NextResponse.json({ ok: true, ...result as object });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ingestion failed";
      const status = /already running|rate limited/i.test(message) ? 429 : 500;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  };
}

export const POST = createIngestHandler();

export function GET() {
  return NextResponse.json(
    { error: "method not allowed; use POST with Authorization: Bearer" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
