"use client";

import { useState } from "react";
import Image from "next/image";
import { companyDomain, knownCompanyDomain } from "@/lib/companyDomain";

// Deterministic, quiet fallback colors for companies without a usable logo.
const AVATAR_COLORS = [
  { background: "#E8F0FF", foreground: "#1F57C9" },
  { background: "#EAF0F6", foreground: "#405B78" },
  { background: "#E7F2F6", foreground: "#356474" },
  { background: "#EEF0F8", foreground: "#4C587B" },
  { background: "#EDF1F6", foreground: "#596579" },
  { background: "#E9F0F3", foreground: "#44616D" },
  { background: "#E4F0F5", foreground: "#2F6276" },
  { background: "#F0F1EC", foreground: "#5E6250" },
] as const;

function avatarColor(company: string): (typeof AVATAR_COLORS)[number] {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function logoUrl(domain: string): string {
  return `https://favicon.vemetric.com/${encodeURIComponent(domain)}?size=128&format=png`;
}

export function CompanyLogo({ company, size = 40 }: { company: string; size?: number }) {
  const domain = companyDomain(company);

  // Keying the stateful image makes a reused row start cleanly when its company
  // changes, without permanently caching a transient network/provider failure.
  return (
    <CompanyLogoImage
      key={`${company}:${domain}:${size}`}
      company={company}
      domain={domain}
      size={size}
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

  if (!domain || failed) return null;

  return (
    <span className="marketing-company-logo" aria-label={`${company} logo`}>
      <Image
        src={logoUrl(domain)}
        alt=""
        width={32}
        height={32}
        priority={priority}
        unoptimized
        decoding="async"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.closest(".landing-company-logo")?.setAttribute("hidden", "");
          setFailed(true);
        }}
      />
      <span aria-hidden>{company}</span>
    </span>
  );
}

function CompanyLogoImage({
  company,
  domain,
  size,
}: {
  company: string;
  domain: string;
  size: number;
}) {
  const src = domain ? logoUrl(domain) : null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(() => !src);

  const avatar = avatarColor(company);
  const radius = Math.round(size * 0.28);

  // The letter circle always renders as the base layer. When a real logo
  // loads it fades in on top; while it's pending or if it errors, the letter
  // shows through — so there's never a broken-image flash.
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
          loading="lazy"
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
