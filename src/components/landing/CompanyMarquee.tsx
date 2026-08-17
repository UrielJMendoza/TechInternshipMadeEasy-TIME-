import Link from "next/link";
import { MarketingCompanyLogo } from "@/components/CompanyLogo";

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
    <div aria-hidden={duplicate} className="landing-company-marquee__copy">
      {companies.map((company, index) =>
        duplicate ? (
          <span key={company} className="landing-company-logo">
            <MarketingCompanyLogo company={company} />
          </span>
        ) : (
          <Link
            key={company}
            href={`/jobs?q=${encodeURIComponent(company)}`}
            prefetch={false}
            className="landing-company-logo"
            aria-label={`View active ${company} listings`}
          >
            <MarketingCompanyLogo company={company} priority={index < 4} />
          </Link>
        ),
      )}
    </div>
  );
}

export function CompanyMarquee({ companies }: CompanyMarqueeProps) {
  if (companies.length === 0) return null;

  return (
    <div
      className="landing-hero-marquee"
      aria-labelledby="company-marquee-title"
    >
      <h2 id="company-marquee-title">Companies hiring now</h2>
      <div
        className="landing-company-marquee"
        role="region"
        aria-label="Companies with current active listings on Timley. Hover or focus to pause."
        tabIndex={0}
      >
        <div className="landing-company-marquee__track">
          <CompanyStrip companies={companies} duplicate={false} />
          <CompanyStrip companies={companies} duplicate />
        </div>
      </div>
    </div>
  );
}
