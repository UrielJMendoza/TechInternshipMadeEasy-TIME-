import { supabase } from "@/lib/supabase";
import type { Internship } from "@/lib/types";
import { Board } from "@/components/Board";

export const revalidate = 300; // re-fetch from Supabase at most every 5 min

const PAGE = 1000; // PostgREST caps responses at 1000 rows; page through

async function fetchJobs(): Promise<Internship[]> {
  const db = supabase();
  const rows: Internship[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("internships")
      .select(
        "id,title,company,location,category,role_type,season,salary,link,source,sponsorship,posted_date,first_seen_at",
      )
      .eq("is_active", true)
      .order("first_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data as Internship[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export default async function Home() {
  let jobs: Internship[] = [];
  let loadError = false;
  try {
    jobs = await fetchJobs();
  } catch {
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Board jobs={jobs} loadError={loadError} generatedAt={new Date().toISOString()} />
      <footer className="mt-10 border-t border-border pt-4 pb-8 text-xs text-faint">
        <p>
          Sourced from{" "}
          <a className="underline hover:text-muted" href="https://github.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships" target="_blank" rel="noopener noreferrer">
            zshah101/Automated-List
          </a>
          ,{" "}
          <a className="underline hover:text-muted" href="https://github.com/vanshb03/Summer2027-Internships" target="_blank" rel="noopener noreferrer">
            vanshb03/Summer2027-Internships
          </a>{" "}
          and{" "}
          <a className="underline hover:text-muted" href="https://github.com/speedyapply/2027-SWE-College-Jobs" target="_blank" rel="noopener noreferrer">
            speedyapply/2027-SWE-College-Jobs
          </a>
          . Refreshes automatically every 2 hours. Star those repos — they do the heavy lifting.
        </p>
      </footer>
    </main>
  );
}
