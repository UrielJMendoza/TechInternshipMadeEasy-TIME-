import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg px-4 py-20 text-fg"
    >
      <div className="ui-card mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="text-xs font-extrabold tracking-[0.14em] text-accent-hover uppercase">
          404
        </p>
        <h1 className="mt-3 text-3xl font-extrabold">Page not found</h1>
        <p className="mt-3 text-muted">
          This page does not exist, or an old listing is outside Timley’s
          retained public-history window.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/jobs" className="ui-button ui-button--primary">
            Browse jobs
          </Link>
          <Link href="/discover" className="ui-button ui-button--secondary">
            Explore collections
          </Link>
        </div>
      </div>
    </main>
  );
}
