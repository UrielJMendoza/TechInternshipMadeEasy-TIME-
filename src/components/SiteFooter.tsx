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
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(8rem,0.65fr)_minmax(0,2fr)] lg:px-8">
        <div>
          <Link
            href="/"
            className="site-wordmark text-2xl font-extrabold tracking-[-0.05em]"
          >
            timley
            <span className="text-[var(--token-marketing-color-primary-display)]">
              .
            </span>
          </Link>
        </div>

        <div className="grid gap-7 sm:grid-cols-3">
          <FooterLinks heading="Product" links={PRODUCT_LINKS} />
          <FooterLinks heading="Explore" links={EXPLORE_LINKS} />
          <FooterLinks heading="Timley" links={COMPANY_LINKS} />
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getUTCFullYear()} Timley.</p>
          <p>Listings are sourced from public, community-maintained feeds.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({
  heading,
  links,
}: {
  heading: string;
  links: ReadonlyArray<{
    href: string;
    label: string;
    external?: boolean;
  }>;
}) {
  return (
    <nav aria-label={`${heading} links`}>
      <h2 className="border-b border-border pb-2 text-xs font-bold tracking-[0.12em] text-faint uppercase">
        {heading}
      </h2>
      <ul className="mt-3 space-y-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              className="text-sm font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
            >
              {item.label}
              {item.external ? <span aria-hidden> ↗</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
