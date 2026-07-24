import Link from "next/link";

const PRODUCT_LINKS = [
  { href: "/jobs", label: "Find jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/tracker", label: "Tracker" },
  { href: "/alerts", label: "Alerts" },
  { href: "/account", label: "Account" },
] as const;

const EXPLORE_LINKS = [
  { href: "/discover/new-this-week", label: "New this week" },
  { href: "/discover/locations", label: "Locations" },
  { href: "/discover/seasons", label: "Hiring seasons" },
  { href: "/collections/campus", label: "Campus collections" },
] as const;

const COMPANY_LINKS = [
  { href: "/changelog", label: "Changelog" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  {
    href: "https://github.com/UrielJMendoza/TechInternshipMadeEasy-TIME-/issues/new",
    label: "Feedback",
    external: true,
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="theme-marketing border-t border-border bg-bg text-fg">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(8rem,0.5fr))] lg:px-8 lg:py-16">
        <div className="max-w-md">
          <Link
            href="/"
            className="site-wordmark text-2xl font-extrabold tracking-[-0.05em]"
          >
            timley
            <span className="text-[var(--token-marketing-color-primary-display)]">
              .
            </span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Fresh internships and new-grad roles, with a built-in application
            tracker. No account required.
          </p>
          <p className="mt-5 text-xs leading-relaxed text-faint">
            Listings come from public community-maintained sources. Timley is
            not affiliated with the employers shown.
          </p>
        </div>

        <nav aria-label="Product links">
          <h2 className="text-xs font-bold tracking-[0.12em] text-faint uppercase">
            Product
          </h2>
          <ul className="mt-4 space-y-3">
            {PRODUCT_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  className="text-sm font-semibold text-muted hover:text-fg"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Explore links">
          <h2 className="text-xs font-bold tracking-[0.12em] text-faint uppercase">
            Explore
          </h2>
          <ul className="mt-4 space-y-3">
            {EXPLORE_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  className="text-sm font-semibold text-muted hover:text-fg"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company and policy links">
          <h2 className="text-xs font-bold tracking-[0.12em] text-faint uppercase">
            Timley
          </h2>
          <ul className="mt-4 space-y-3">
            {COMPANY_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  className="text-sm font-semibold text-muted hover:text-fg"
                  href={item.href}
                  target={"external" in item && item.external ? "_blank" : undefined}
                  rel={
                    "external" in item && item.external
                      ? "noopener noreferrer"
                      : undefined
                  }
                >
                  {item.label}
                  {"external" in item && item.external ? (
                    <span aria-hidden> ↗</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getUTCFullYear()} Timley.</p>
          <p>Job discovery and application organization.</p>
        </div>
      </div>
    </footer>
  );
}
