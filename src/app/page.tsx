import { Board } from "@/components/Board";
import { queryJobs, type JobPage } from "@/lib/jobQuery";
import { SOURCE_IDS, SOURCE_REGISTRY } from "@/lib/ingest/sourceRegistry";

export const revalidate = 300;

function emptyPage(): JobPage {
  return {
    items: [],
    total: 0,
    facets: { locations: [], categories: [], sources: [], terms: [] },
    nextCursor: null,
    hasMore: false,
    updatedAt: null,
    roleTotals: { internship: 0, new_grad: 0 },
  };
}

export default async function Home() {
  let initialPage = emptyPage();
  let loadError = false;
  try {
    initialPage = await queryJobs({
      roleType: "internship",
      sort: "newest",
      pageSize: 30,
    });
  } catch {
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <a
        href="#job-results"
        className="fixed top-3 left-3 z-[150] -translate-y-24 rounded-lg bg-action px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
      >
        Skip to job results
      </a>
      <Board
        jobs={initialPage.items}
        initialPage={initialPage}
        loadError={loadError}
        generatedAt={new Date().toISOString()}
        updatedAt={initialPage.updatedAt}
      />
      <footer className="mt-14 border-t border-border pt-5 pb-10 text-xs leading-relaxed text-faint">
        <p>
          timley.dev aggregates public listings from{" "}
          {SOURCE_IDS.map((source, index) => (
            <span key={source}>
              {index > 0 && (index === SOURCE_IDS.length - 1 ? " and " : ", ")}
              <a
                className="underline underline-offset-2 hover:text-muted"
                href={SOURCE_REGISTRY[source].homepage}
                target="_blank"
                rel="noopener noreferrer"
              >
                {SOURCE_REGISTRY[source].label}
              </a>
            </span>
          ))}
          . Coverage is limited to listings those sources expose and that have
          explicit US location evidence. Source-listed compensation is shown as
          supplied and is not independently verified; category estimates never
          affect pay sorting. Your To apply roles, stages, and filter
          preferences remain in your browser.
        </p>
      </footer>
    </main>
  );
}
