import { decodeJobCursor, InvalidCursorError, parseFilters, queryJobs } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  try {
    const cursorSnapshot = cursor ? decodeJobCursor(cursor).asOf : undefined;
    const snapshot = await getPublicJobsSnapshot(cursorSnapshot);
    const page = queryJobs(filters, { cursor, limit: 36, snapshot });
    return Response.json(
      { items: page.items, nextCursor: page.nextCursor, total: page.total },
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return Response.json(
        {
          code: "CURSOR_REFRESH_REQUIRED",
          error: "The jobs changed since this page was loaded. Refreshing keeps your filters intact.",
        },
        { status: 409 },
      );
    }
    return Response.json({ error: "The live jobs feed is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
