"use client";

import { useState } from "react";
import Image from "next/image";
import { companyDomain, knownCompanyDomain } from "@/lib/companyDomain";

// Deterministic neutral fallbacks for companies without a usable logo.
const AVATAR_COLORS = [
  { background: "#000000", foreground: "#FFFFFF" },
  { background: "#F5F5F5", foreground: "#000000" },
  { background: "#E10600", foreground: "#FFFFFF" },
  { background: "#E5E5E5", foreground: "#000000" },
] as const;

function avatarColor(company: string): (typeof AVATAR_COLORS)[number] {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function logoUrl(domain: string): string {
  return `https://favicon.vemetric.com/${encodeURIComponent(domain)}?size=128&format=png`;
}

interface CompanyLogoProps {
  company: string;
  size?: number;
  curatedOnly?: boolean;
  priority?: boolean;
}

export function CompanyLogo({
  company,
  size = 40,
  curatedOnly = false,
  priority = false,
}: CompanyLogoProps) {
  const domain = curatedOnly
    ? (knownCompanyDomain(company) ?? "")
    : companyDomain(company);

  // Keying the stateful image makes a reused row start cleanly when its company
  // changes, without permanently caching a transient network/provider failure.
  return (
    <CompanyLogoImage
      key={`${company}:${domain}:${size}`}
      company={company}
      domain={domain}
      size={size}
      priority={priority}
    />
  );
}

export function MarketingCompanyLogo({
  company,
  priority = false,
}: {
  company: string;
  priority?: boolean;
}) {
  const domain = knownCompanyDomain(company);
  const [failed, setFailed] = useState(() => !domain);
  const showFallback = !domain || failed;

  return (
    <span className="marketing-company-logo" aria-label={`${company} logo`}>
      {showFallback ? (
        <span className="marketing-company-logo__fallback" aria-hidden>
          {company.charAt(0).toUpperCase()}
        </span>
      ) : (
        <Image
          src={logoUrl(domain)}
          alt=""
          width={36}
          height={36}
          priority={priority}
          unoptimized
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <span aria-hidden>{company}</span>
    </span>
  );
}

function CompanyLogoImage({
  company,
  domain,
  size,
  priority,
}: {
  company: string;
  domain: string;
  size: number;
  priority: boolean;
}) {
  const src = domain ? logoUrl(domain) : null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(() => !src);

  const avatar = avatarColor(company);
  const radius = Math.round(size * 0.22);

  // The letter circle always renders as the base layer. When a real logo
  // loads it fades in on top. While it is pending or if it errors, the letter
  // shows through, so there is never a broken-image flash.
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.4,
        background: avatar.background,
        color: avatar.foreground,
        boxShadow: "inset 0 0 0 1px var(--border)",
      }}
    >
      {company.charAt(0).toUpperCase()}
      {src && !failed && (
        <Image
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading={priority ? undefined : "lazy"}
          priority={priority}
          unoptimized
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 bg-white object-contain transition-opacity"
          style={{ padding: size * 0.12, opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}
