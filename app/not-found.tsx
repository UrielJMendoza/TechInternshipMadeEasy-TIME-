import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export default function NotFound() {
  return (
    <main id="main-content">
      <SiteHeader active="jobs" />
      <div className="detail-shell">
        <a className="back-link" href="/jobs"><span aria-hidden="true">←</span> Back to newest jobs</a>
        <div className="empty-state">
          <h1>We couldn’t find that page.</h1>
          <p>The link may be outdated, or a job may have closed and left the current feed.</p>
          <a className="button primary" href="/jobs">See newest jobs</a>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
