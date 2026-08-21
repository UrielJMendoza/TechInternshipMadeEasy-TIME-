type SiteHeaderProps = {
  active?: "home" | "jobs" | "saved";
};

export function SiteHeader({ active = "home" }: SiteHeaderProps) {
  const links = [
    { href: "/", label: "Latest", id: "home" },
    { href: "/jobs", label: "All jobs", id: "jobs" },
    { href: "/saved", label: "Saved", id: "saved" },
  ] as const;

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Timley home">
        Timley
      </a>
      <nav aria-label="Primary navigation">
        {links.map((link) => (
          <a
            className={active === link.id ? "active" : undefined}
            href={link.href}
            aria-current={active === link.id ? "page" : undefined}
            key={link.href}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
