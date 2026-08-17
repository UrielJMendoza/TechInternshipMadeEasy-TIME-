"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/jobs", label: "Find Jobs" },
  { href: "/tracker", label: "Tracker" },
  { href: "/alerts", label: "Alerts" },
  { href: "/account", label: "Account" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const mobileTriggerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !mobileMenuRef.current?.open) return;
      mobileMenuRef.current.open = false;
      mobileTriggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeMobileMenu = () => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  };

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="theme-marketing site-header">
      <div className="site-header__inner mx-auto flex min-h-[3.75rem] max-w-7xl items-center justify-end gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <span aria-hidden className="hidden lg:block" />

        <nav
          aria-label="Primary navigation"
          className="site-nav hidden items-center lg:flex"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="site-nav-link"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center justify-self-end gap-3 lg:flex">
          <Link
            href="/jobs"
            prefetch={false}
            className="site-header__cta ui-button ui-button--primary min-h-9 px-4"
          >
            Browse Jobs
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <details
          ref={mobileMenuRef}
          className="site-mobile-menu relative lg:hidden"
        >
          <summary
            ref={mobileTriggerRef}
            aria-label="Open navigation menu"
            className="site-mobile-menu__trigger ui-button ui-button--secondary ui-button--icon list-none"
          >
            <span aria-hidden className="site-mobile-menu__icon">
              <span />
              <span />
            </span>
          </summary>
          <nav
            aria-label="Mobile navigation"
            className="site-mobile-menu__panel ui-popover absolute right-0 mt-2 w-[min(19rem,calc(100vw-2rem))] p-2"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={closeMobileMenu}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="site-mobile-menu__link flex min-h-11 items-center border-b border-border px-3 text-sm font-semibold text-muted hover:bg-raised hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/jobs"
              prefetch={false}
              onClick={closeMobileMenu}
              className="ui-button ui-button--primary mt-2 w-full"
            >
              Browse Jobs
              <span aria-hidden>↗</span>
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
