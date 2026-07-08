import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/run";
import { authorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runIngest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Vercel Cron sends GET; manual/pg_cron triggers may POST.
export { handle as GET, handle as POST };
