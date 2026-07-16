"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-5xl items-center px-4 py-10 sm:px-6">
      <section
        role="alert"
        className="w-full rounded-3xl border border-border-strong bg-surface px-5 py-10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)] sm:px-10"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-hot">
          Listings unavailable
        </p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-fg">
          Something went wrong
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          We couldn&apos;t load the job board. Try again, or return to the board
          and refresh in a moment.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent bg-action px-5 text-sm font-bold text-white transition-colors hover:border-accent hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-strong bg-raised px-5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Back to the board
          </Link>
        </div>
      </section>
    </main>
  );
}
