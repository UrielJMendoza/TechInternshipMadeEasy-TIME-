import { boundedJson } from "@/lib/http/bounded-json";
import { getPublicJobsSnapshot, getPublicJobsByIds } from "@/lib/jobs/live";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ogkocdharscqzdrnlpnq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh";

const REPORT_KINDS = new Set([
  "closed",
  "duplicate",
  "wrong_location",
  "wrong_pay",
  "wrong_logo",
  "wrong_sponsorship",
  "wrong_title",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReportRouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: ReportRouteProps) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid report origin." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return Response.json({ error: "That report is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = await boundedJson(request);
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: "That report is too large." }, { status: 413 });
    return Response.json({ error: "The report could not be read." }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return Response.json({ error: "The report is invalid." }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const reporterToken = typeof body.reporterToken === "string" ? body.reporterToken : "";
  const details = typeof body.details === "string"
    ? body.details.normalize("NFKC").trim().slice(0, 500)
    : "";
  if (!REPORT_KINDS.has(kind) || !UUID_PATTERN.test(reporterToken)) {
    return Response.json({ error: "Choose a valid report reason." }, { status: 400 });
  }

  const { id } = await params;
  const snapshot = await getPublicJobsSnapshot();
  const publicJob = (await getPublicJobsByIds([id], snapshot)).get(id);
  const canonicalJob = publicJob
    ? snapshot.jobs.find((job) => job.id === publicJob.id && job.active)
    : null;
  const sourceJobId = canonicalJob?.sourceRecordIds.find((sourceId) => UUID_PATTERN.test(sourceId));
  if (!publicJob || !sourceJobId) {
    return Response.json({ error: "That listing is no longer reportable." }, { status: 404 });
  }

  let response: Response;
  try {
    response = await fetch(new URL("/rest/v1/job_reports", SUPABASE_URL), {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        job_id: sourceJobId,
        kind,
        details: details || null,
        reporter_token: reporterToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json(
      { error: "The report could not be saved right now." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (response.ok) {
    return Response.json({ ok: true }, { status: 201, headers: { "cache-control": "no-store" } });
  }
  const failure = await response.json().catch(() => ({})) as { code?: string };
  if (failure.code === "P0001") return Response.json({ error: "Too many reports. Please try again later." }, { status: 429, headers: { "retry-after": "3600", "cache-control": "no-store" } });
  if (response.status === 409 && failure.code === "23505") {
    return Response.json(
      { ok: true, alreadyReported: true },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { error: "The report could not be saved right now." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
