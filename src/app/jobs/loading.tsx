export default function JobsLoading() {
  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg"
      aria-busy="true"
    >
      <section
        aria-labelledby="jobs-loading-title"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      >
        <div className="border-b border-border pb-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent-hover">
            Job discovery
          </p>
          <h1
            id="jobs-loading-title"
            className="mt-1.5 text-3xl font-extrabold tracking-[-0.04em] text-fg sm:text-4xl"
          >
            Loading current listings
          </h1>
          <p role="status" className="mt-2 text-sm text-muted">
            Timley is preparing the active internship and new-grad feed…
          </p>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-surface p-3">
          <div className="h-10 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="h-10 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
            <div className="h-10 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
            <div className="h-10 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
          </div>
        </div>

        <div className="mt-5 space-y-2.5" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="ui-card grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 px-4 py-4"
            >
              <div className="size-11 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
              <div>
                <div className="h-3.5 w-32 animate-pulse rounded bg-raised motion-reduce:animate-none" />
                <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-raised motion-reduce:animate-none" />
                <div className="mt-4 h-7 w-2/3 animate-pulse rounded bg-raised motion-reduce:animate-none" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
