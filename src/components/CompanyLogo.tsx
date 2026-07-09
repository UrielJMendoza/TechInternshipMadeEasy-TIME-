"use client";

import { useEffect, useState } from "react";
import { companyDomain } from "@/lib/companyDomain";

// Deterministic avatar color per company, drawn from the iOS dark palette —
// used for the letter fallback when no logo loads.
const AVATAR_COLORS = [
  "10, 132, 255", // blue
  "100, 210, 255", // teal
  "191, 90, 242", // purple
  "255, 214, 10", // yellow
  "255, 159, 10", // orange
  "48, 209, 88", // green
  "255, 55, 95", // pink
  "172, 142, 104", // brown
];

function avatarColor(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Domains that already failed this session — skip straight to the letter so we
// don't re-request a logo we know is missing as the user scrolls/filters.
const failedDomains = new Set<string>();

function logoUrl(domain: string): string {
  // Clearbit serves transparent PNG logos and 404s cleanly for unknown
  // domains, which drives onError -> the letter fallback below.
  return `https://logo.clearbit.com/${domain}?size=80`;
}

export function CompanyLogo({ company, size = 40 }: { company: string; size?: number }) {
  const domain = companyDomain(company);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(() => !domain || failedDomains.has(domain));

  // A pooled list row is reused for different companies as filters change —
  // reset the image state for the new company.
  useEffect(() => {
    setLoaded(false);
    setFailed(!domain || failedDomains.has(domain));
  }, [domain]);

  const rgb = avatarColor(company);
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
        background: `rgba(${rgb}, 0.15)`,
        color: `rgb(${rgb})`,
      }}
    >
      {company.charAt(0).toUpperCase()}
      {domain && !failed && (
        <img
          src={logoUrl(domain)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            failedDomains.add(domain);
            setFailed(true);
          }}
          className="absolute inset-0 bg-white object-contain transition-opacity duration-200"
          style={{ padding: size * 0.12, opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}
