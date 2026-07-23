"use client";

export default function JobsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      className="theme-application flex min-h-[70dvh] items-center bg-bg px-4 py-16"
    >
      <section
        role="alert"
        className="ui-card mx-auto w-full max-w-lg px-6 py-10 text-center"
      >
        <span
          aria-hidden
          className="mx-auto flex size-11 items-center justify-center rounded-lg border border-error/30 bg-error-soft text-xl font-extrabold text-error"
        >
          !
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.03em] text-fg">
          The job application hit an error
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your saved jobs and application stages remain in this browser. Retry
          the listing request when you are ready.
        </p>
        <button
          type="button"
          onClick={reset}
          className="ui-button ui-button--secondary mt-5"
        >
          Retry jobs
        </button>
      </section>
    </main>
  );
}
