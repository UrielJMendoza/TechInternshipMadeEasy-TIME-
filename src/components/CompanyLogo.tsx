"use client";

import { useState } from "react";
import Image from "next/image";
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
          className="absolute inset-0 bg-white object-contain transition-opacity duration-200"
          style={{ padding: size * 0.12, opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  );
}
