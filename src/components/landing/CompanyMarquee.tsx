import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { companySlugFromName } from "@/lib/publicCatalog";

interface CompanyMarqueeProps {
  companies: string[];
}

function CompanyStrip({
  companies,
  duplicate,
}: {
  companies: string[];
  duplicate: boolean;
}) {
  return (
    <div
      aria-hidden={duplicate}
      className="landing-company-marquee__copy"
    >
      {companies.map((company) => (
        duplicate ? (
          <span key={company} className="landing-company-pill">
            <CompanyLogo company={company} size={32} />
            <span>{company}</span>
          </span>
        ) : (
          <Link
            key={company}
            href={`/companies/${companySlugFromName(company)}`}
            className="landing-company-pill"
          >
            <CompanyLogo company={company} size={32} />
            <span>{company}</span>
          </Link>
        )
      ))}
    </div>
  );
}

export function CompanyMarquee({ companies }: CompanyMarqueeProps) {
  return (
    <section
      aria-labelledby="company-marquee-title"
      className="theme-marketing border-t border-border bg-bg py-9 text-fg"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-center">
          <div>
            <h2
              id="company-marquee-title"
              className="text-xs font-extrabold tracking-[0.12em] text-faint uppercase"
            >
              Companies with active listings
            </h2>
            <p className="mt-2 text-xs text-muted">
              Appearing on Timley—not partnerships or endorsements.
            </p>
          </div>

          {companies.length > 0 ? (
            <div
              className="landing-company-marquee"
              role="region"
              aria-label="Companies with active listings on Timley. Hover or focus to pause."
              tabIndex={0}
            >
              <div className="landing-company-marquee__track">
                <CompanyStrip companies={companies} duplicate={false} />
                <CompanyStrip companies={companies} duplicate />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              Company names will appear when the active listing feed is
              available.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
