import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authorized } from "@/lib/auth";
import { CATEGORY_LABELS, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DigestJob {
  title: string;
  company: string;
  location: string;
  category: Category;
  role_type: string;
  link: string;
  first_seen_at: string;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const to = process.env.DIGEST_TO;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    return NextResponse.json({
      ok: false,
      skipped: "RESEND_API_KEY or DIGEST_TO not configured — digest disabled",
    });
  }

  // digest_take atomically returns rows first seen since the last digest and
  // advances the watermark, so consecutive runs never re-send the same roles.
  const { data, error } = await supabase().rpc("digest_take", {
    secret: process.env.CRON_SECRET,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const jobs = (data.jobs ?? []) as DigestJob[];
  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, sent: false, newRoles: 0 });
  }

  const interns = jobs.filter((j) => j.role_type === "internship");
  const grads = jobs.filter((j) => j.role_type === "new_grad");
  const section = (label: string, list: DigestJob[]) =>
    list.length === 0
      ? ""
      : `${label} (${list.length})\n\n` +
        list
          .map(
            (j) =>
              `• ${j.company} — ${j.title}\n  ${[j.location, CATEGORY_LABELS[j.category]].filter(Boolean).join(" · ")}\n  ${j.link}`,
          )
          .join("\n\n") +
        "\n\n";

  const text =
    `${jobs.length} new role${jobs.length === 1 ? "" : "s"} since the last digest.\n\n` +
    section("INTERNSHIPS", interns) +
    section("NEW GRAD", grads) +
    "— TIME · Tech Internships Made Easy";

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from: `TIME Digest <${process.env.DIGEST_FROM ?? "onboarding@resend.dev"}>`,
    to,
    subject: `${jobs.length} new tech role${jobs.length === 1 ? "" : "s"} — TIME digest`,
    text,
  });
  if (sendError) {
    return NextResponse.json({ ok: false, error: sendError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, newRoles: jobs.length });
}

export { handle as GET, handle as POST };
