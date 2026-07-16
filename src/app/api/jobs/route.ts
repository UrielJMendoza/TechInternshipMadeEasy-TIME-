import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { queryJobs } from "@/lib/jobQuery";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 32_768;

type JobsQuery = typeof queryJobs;

export function createJobsHandler(query: JobsQuery = queryJobs) {
  return async function handle(request: Request): Promise<NextResponse> {
    if (request.method !== "POST") {
      return NextResponse.json(
        { error: "method not allowed; use POST" },
        { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "request too large" },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: "request too large" },
          { status: 413, headers: { "Cache-Control": "no-store" } },
        );
      }
      const input: unknown = JSON.parse(rawBody);
      const page = await query(input);
      return NextResponse.json(page, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      const clientError = error instanceof ZodError ||
        (error instanceof Error && /cursor|JSON/i.test(error.message));
      return NextResponse.json(
        { error: clientError ? "invalid job query" : "unable to load jobs" },
        {
          status: clientError ? 400 : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
}

export const POST = createJobsHandler();

export function GET(request: Request) {
  return createJobsHandler()(new Request(request.url, { method: "GET" }));
}
