"use client";

import { useState } from "react";
import type { PopularCompany } from "@/lib/jobs";
import { CompanyLogo } from "./CompanyLogo";

type PopularCompanyRailProps = {
  companies: PopularCompany[];
};

function CompanySet({
  companies,
  duplicate = false,
}: PopularCompanyRailProps & { duplicate?: boolean }) {
  return (
    <div className="company-rail-set" aria-hidden={duplicate || undefined}>
      {companies.map((company) => {
        const content = (
          <>
            <CompanyLogo company={company.name} domain={company.domain} size="rail" />
            <span className="company-rail-name" title={company.name}>{company.name}</span>
            {!duplicate ? (
              <span className="sr-only">
                {company.recentPostings} recent {company.recentPostings === 1 ? "posting" : "postings"}
              </span>
            ) : null}
          </>
        );

        return duplicate ? (
          <a
            className="company-rail-item"
            href={`/jobs?company=${encodeURIComponent(company.name)}`}
            key={`duplicate-${company.name}`}
            tabIndex={-1}
          >
            {content}
          </a>
        ) : (
          <a
            className="company-rail-item"
            href={`/jobs?company=${encodeURIComponent(company.name)}`}
            key={`primary-${company.name}`}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

export function PopularCompanyRail({ companies }: PopularCompanyRailProps) {
  const [paused, setPaused] = useState(false);

  if (companies.length === 0) return null;

  return (
    <section className="company-rail" aria-labelledby="company-rail-title">
      <div className="company-rail-toolbar">
        <h2 id="company-rail-title">Companies with recent postings</h2>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? "Play logos" : "Pause logos"}
        </button>
      </div>
      <div className="company-rail-window">
        <div className={`company-rail-track${paused ? " is-paused" : ""}`}>
          <CompanySet companies={companies} />
          <CompanySet companies={companies} duplicate />
        </div>
      </div>
    </section>
  );
}
