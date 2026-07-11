import { supabase } from "@/lib/supabase";
import { sanitizeUsLocation } from "@/lib/usLocations";
import type { Internship } from "@/lib/types";
import { Board } from "@/components/Board";

export const revalidate = 300; // re-fetch from Supabase at most every 5 min

const PAGE = 1000; // PostgREST caps responses at 1000 rows; page through

async function fetchJobs(): Promise<Internship[]> {
  const db = supabase();
  const rows: Internship[] = [];
  // Ingestion already drops stale postings, but sources can disagree on a
  // job's age — never show anything the board considers older than 120 days.
  const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("internships")
      .select(
        "id,title,company,location,category,role_type,season,salary,link,source,sponsorship,posted_date,first_seen_at",
      )
      .eq("is_active", true)
      .or(`posted_date.is.null,posted_date.gte.${cutoff}`)
      .order("first_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const job of (data ?? []) as Internship[]) {
      const location = sanitizeUsLocation(job.location);
      if (!location.eligible) continue;
      rows.push({ ...job, location: location.display });
    }
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function fetchUpdatedAt(): Promise<string | null> {
  const { data } = await supabase()
    .from("internships")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1);
  return data?.[0]?.last_seen_at ?? null;
}

export default async function Home() {
  let jobs: Internship[] = [];
  let updatedAt: string | null = null;
  let loadError = false;
  try {
    [jobs, updatedAt] = await Promise.all([fetchJobs(), fetchUpdatedAt()]);
  } catch {
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <a
        href="#job-results"
        className="fixed top-3 left-3 z-[150] -translate-y-24 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
      >
        Skip to job results
      </a>
      <Board
        jobs={jobs}
        loadError={loadError}
        generatedAt={new Date().toISOString()}
        updatedAt={updatedAt}
      />
      <footer className="mt-14 border-t border-border pt-5 pb-10 text-xs leading-relaxed text-faint">
        <p>
          timley.dev — sourced from{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="https://github.com/SimplifyJobs/Summer2026-Internships" target="_blank" rel="noopener noreferrer">
            SimplifyJobs
          </a>
          ,{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships" target="_blank" rel="noopener noreferrer">
            zshah101/Automated-List
          </a>
          ,{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="https://github.com/vanshb03/Summer2027-Internships" target="_blank" rel="noopener noreferrer">
            vanshb03/Summer2027-Internships
          </a>{" "}
          and{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="https://github.com/speedyapply/2027-SWE-College-Jobs" target="_blank" rel="noopener noreferrer">
            speedyapply/2027-SWE-College-Jobs
          </a>
          . Star those repos — they do the heavy lifting. Company favicons via{" "}
          <a className="underline underline-offset-2 hover:text-muted" href="https://vemetric.com/favicon-api" target="_blank" rel="noopener noreferrer">
            Vemetric
          </a>
          . USA roles only, postings older than 4 months age out automatically. Saved roles, application stages, and filter preferences are stored only in your browser.
        </p>
      </footer>
    </main>
  );
}
