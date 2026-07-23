"use client";

import { useEffect, useState } from "react";
import {
  FOLLOWED_COMPANIES_EVENT,
  FOLLOWED_COMPANIES_STORAGE_KEY,
  parseFollowedCompanies,
  serializeFollowedCompanies,
  toggleFollowedCompany,
} from "@/lib/followedCompanies";

export function FollowCompanyButton({
  slug,
  company,
}: {
  slug: string;
  company: string;
}) {
  const [followed, setFollowed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      const slugs = parseFollowedCompanies(
        window.localStorage.getItem(FOLLOWED_COMPANIES_STORAGE_KEY),
      );
      setFollowed(slugs.includes(slug));
      setReady(true);
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener(FOLLOWED_COMPANIES_EVENT, read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener(FOLLOWED_COMPANIES_EVENT, read);
    };
  }, [slug]);

  const toggle = () => {
    const current = parseFollowedCompanies(
      window.localStorage.getItem(FOLLOWED_COMPANIES_STORAGE_KEY),
    );
    const next = toggleFollowedCompany(current, slug);
    window.localStorage.setItem(
      FOLLOWED_COMPANIES_STORAGE_KEY,
      serializeFollowedCompanies(next),
    );
    window.dispatchEvent(new Event(FOLLOWED_COMPANIES_EVENT));
    setFollowed(next.includes(slug));
  };

  return (
    <button
      type="button"
      aria-pressed={followed}
      disabled={!ready}
      onClick={toggle}
      className={`ui-button ${followed ? "ui-selected" : "ui-button--secondary"}`}
    >
      {followed ? `Following ${company}` : `Follow ${company}`}
    </button>
  );
}
