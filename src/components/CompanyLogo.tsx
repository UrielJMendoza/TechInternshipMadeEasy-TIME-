"use client";

import { useState } from "react";
import Image from "next/image";

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
  return `/api/company-logo?domain=${encodeURIComponent(domain)}`;
}

function reportUrl(company: string, domain: string, listingUrl: string): string {
  const query = new URLSearchParams({
    title: `Incorrect company logo: ${company}`,
    body: [
      `Company: ${company}`,
      `Domain currently used: ${domain}`,
      `Listing: ${listingUrl}`,
      "",
      "What logo or company domain should be used instead?",
    ].join("\n"),
  });
  return `https://github.com/UrielJMendoza/TechInternshipMadeEasy-TIME-/issues/new?${query}`;
}

export function CompanyLogo({
  company,
  domain,
  listingUrl,
  size = 40,
}: {
  company: string;
  domain: string | null;
  listingUrl: string;
  size?: number;
}) {
  // Keying the stateful image makes a reused row start cleanly when its company
  // changes, without permanently caching a transient network/provider failure.
  return (
    <CompanyLogoImage
      key={`${company}:${domain}:${size}`}
      company={company}
      domain={domain}
      listingUrl={listingUrl}
      size={size}
    />
  );
}

function CompanyLogoImage({
  company,
  domain,
  listingUrl,
  size,
}: {
  company: string;
  domain: string | null;
  listingUrl: string;
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
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="relative flex size-full items-center justify-center overflow-hidden font-bold"
        style={{
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
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="absolute inset-0 bg-white object-contain transition-opacity duration-200"
            style={{ padding: size * 0.12, opacity: loaded ? 1 : 0 }}
          />
        )}
      </span>
      {domain && (
        <a
          href={reportUrl(company, domain, listingUrl)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Report an incorrect logo for ${company} (opens GitHub in a new tab)`}
          title="Report incorrect logo"
          className="pointer-events-none absolute -bottom-1.5 -right-1.5 z-20 flex size-6 items-center justify-center rounded-full border border-border bg-raised text-faint opacity-0 shadow-sm transition-[color,opacity] hover:text-fg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <FlagIcon />
        </a>
      )}
    </span>
  );
}

function FlagIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 22V4" />
      <path d="M5 4h11l-1.5 4L16 12H5" />
    </svg>
  );
}
