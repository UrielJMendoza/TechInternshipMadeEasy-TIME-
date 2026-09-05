"use client";

import Image from "next/image";
import { useState } from "react";
import { companyDomain } from "@/app/data/company-domains";

type CompanyLogoProps = {
  company: string;
  domain?: string;
  size?: "row" | "rail" | "detail";
  priority?: boolean;
};

function logoUrl(domain: string): string {
  return `https://favicon.vemetric.com/${encodeURIComponent(domain)}?size=128&format=png`;
}

export function CompanyLogo({
  company,
  domain: suppliedDomain,
  size = "row",
  priority = false,
}: CompanyLogoProps) {
  const domain = suppliedDomain?.trim().toLowerCase() || companyDomain(company);
  const src = domain ? logoUrl(domain) : null;
  const [failed, setFailed] = useState(() => !src);

  return (
    <span
      className={`company-logo company-logo-${size}`}
      aria-hidden="true"
      data-company-domain={domain || undefined}
    >
      {src && !failed ? (
        <Image
          className="company-logo-image"
          src={src}
          alt=""
          width={128}
          height={128}
          sizes={size === "detail" ? "60px" : size === "rail" ? "50px" : "46px"}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          unoptimized
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}
