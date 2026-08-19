import { createPublicJobsFeed } from "@/lib/publicJobsFeed";
import { fetchJobsSnapshot } from "@/lib/jobs";

export const dynamic = "force-static";
export const revalidate = 21600;

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
        "public, max-age=300, s-maxage=21600, stale-while-revalidate=21600, stale-if-error=604800",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
