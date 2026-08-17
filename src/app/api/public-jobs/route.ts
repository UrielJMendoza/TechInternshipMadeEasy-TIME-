import { createPublicJobsFeed } from "@/lib/publicJobsFeed";
import { fetchJobsSnapshot } from "@/lib/jobs";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const snapshot = await fetchJobsSnapshot();
  if (
    snapshot.loadError ||
    snapshot.partialData ||
    snapshot.jobs.length === 0
  ) {
    // Throwing prevents a failed/partial ISR regeneration from replacing the
    // last complete public feed.
    throw new Error("A complete public jobs feed is temporarily unavailable");
  }

  return Response.json(createPublicJobsFeed(snapshot), {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400, stale-if-error=604800",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
