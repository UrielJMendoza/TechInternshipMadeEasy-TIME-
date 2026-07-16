const SKELETON_ROWS = [0, 1, 2, 3, 4, 5] as const;

export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto max-w-5xl px-4 py-10 sm:px-6"
    >
      <p className="sr-only" role="status">
        Loading job listings
      </p>

      <div
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-3">
            <div className="h-9 w-28 rounded-lg bg-raised" />
            <div className="h-4 w-[min(32rem,78vw)] rounded bg-surface" />
          </div>
          <div className="h-3 w-32 rounded bg-surface" />
        </div>

        <div className="sticky top-0 z-50 -mx-4 mt-8 border-b border-border/60 bg-bg px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="h-10 w-48 rounded-full bg-surface" />
            <div className="h-10 w-24 rounded-full bg-surface" />
          </div>
          <div className="mt-3 h-10 w-full max-w-sm rounded-xl bg-surface" />
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="h-3 w-28 rounded bg-surface" />
          <div className="h-3 w-64 max-w-[55vw] rounded bg-surface" />
        </div>

        <ul className="mt-3 space-y-2.5">
          {SKELETON_ROWS.map((row) => (
            <li
              key={row}
              className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 sm:px-5"
            >
              <div className="size-10 shrink-0 rounded-xl bg-raised" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-4 w-36 max-w-[70%] rounded bg-raised" />
                <div className="h-3 w-56 max-w-[90%] rounded bg-raised" />
                <div className="h-5 w-20 rounded-full bg-raised" />
              </div>
              <div className="size-11 shrink-0 rounded-full bg-raised" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
