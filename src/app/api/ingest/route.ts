import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runIngest } from "@/lib/ingest/run";
import { isUnauthorized, requestSecret, secretsMatch } from "@/lib/auth";
import { JOBS_CACHE_TAG } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = requestSecret(req);
  if (!secret || !secretsMatch(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runIngest(secret);
    revalidateTag(JOBS_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = String(e);
    const status = isUnauthorized(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

// Vercel Cron sends GET; authenticated manual triggers may POST.
export { handle as GET, handle as POST };
