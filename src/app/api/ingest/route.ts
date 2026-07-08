import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/run";
import { isUnauthorized, requestSecret } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = requestSecret(req);
  if (!secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runIngest(secret);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = String(e);
    const status = isUnauthorized(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

// Vercel Cron sends GET; pg_cron and manual triggers may POST.
export { handle as GET, handle as POST };
