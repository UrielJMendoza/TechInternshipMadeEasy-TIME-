import { parseFilters, queryJobs } from "@/lib/jobs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  try {
    const page = queryJobs(filters, { cursor, limit: 36 });
    return Response.json(
      { items: page.items, nextCursor: page.nextCursor, total: page.total },
      { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return Response.json({ error: "That page link is no longer valid. Reload the feed to continue." }, { status: 400 });
  }
}
