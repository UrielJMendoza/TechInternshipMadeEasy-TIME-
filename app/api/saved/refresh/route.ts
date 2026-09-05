import { boundedJson } from "@/lib/http/bounded-json";
import { getPublicJobsSnapshot, getPublicJobsFeedHealth, getPublicJobsByIds } from "@/lib/jobs/live";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    const body = await boundedJson(request, 16_384) as { ids?: unknown };
    if (!body || !Array.isArray(body.ids) || body.ids.length > 100 ||
      !body.ids.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id))) {
      return Response.json({ error: "Choose up to 100 saved listings." }, { status: 400 });
    }
    const snapshot = await getPublicJobsSnapshot();
    const matches = await getPublicJobsByIds([...new Set(body.ids as string[])], snapshot);
    return Response.json({
      mode: getPublicJobsFeedHealth().mode,
      items: [...new Set(body.ids as string[])].map(id => ({ requestedId: id, job: matches.get(id) ?? null })),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof RangeError ? 413 : error instanceof SyntaxError ? 400 : 503;
    return Response.json({ error: "Saved listing details could not be refreshed." }, { status, headers: { "cache-control": "no-store" } });
  }
}
