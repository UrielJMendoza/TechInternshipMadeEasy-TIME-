import { CompanyLogo } from "./CompanyLogo";

const POPULAR_COMPANIES = [
  "Stripe",
  "Figma",
  "Notion",
  "Linear",
  "Duolingo",
  "NVIDIA",
  "Google",
  "Apple",
  "Microsoft",
  "Meta",
  "TikTok",
  "Cloudflare",
  "Anthropic",
  "LinkedIn",
  "Tesla",
  "SpaceX",
  "Palantir",
  "Handshake",
  "JPMorgan Chase",
  "Goldman Sachs",
  "Jane Street",
  "Optiver",
  "Intel",
  "Oracle",
  "ServiceNow",
  "Accenture",
  "Boeing",
  "Lockheed Martin",
  "Palo Alto Networks",
  "The Trade Desk",
] as const;

function CompanySet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="company-rail-set" aria-hidden={duplicate || undefined}>
      {POPULAR_COMPANIES.map((company) => (
        <div className="company-rail-item" key={`${duplicate ? "duplicate" : "primary"}-${company}`}>
          <CompanyLogo company={company} size="rail" />
          <span>{company}</span>
        </div>
      ))}
    </div>
  );
}

export function PopularCompanyRail() {
  return (
    <section className="company-rail" aria-label="Popular companies">
      <div className="company-rail-window">
        <div className="company-rail-track">
          <CompanySet />
          <CompanySet duplicate />
        </div>
      </div>
    </section>
  );
}
