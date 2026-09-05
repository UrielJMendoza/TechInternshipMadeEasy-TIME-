export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <a className="brand" href="/">Timley</a>
        <p>Internships and new-grad jobs, newest first.</p>
      </div>
      <nav className="footer-links" aria-label="Footer navigation">
        <a href="/jobs">All jobs</a>
        <a href="/saved">Saved</a>
        <a href="/how-it-works">How it works</a>
      </nav>
      <p className="footer-note">No account. Local saves. Direct applications.</p>
    </footer>
  );
}
