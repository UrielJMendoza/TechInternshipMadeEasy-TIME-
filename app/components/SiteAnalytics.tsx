"use client";

import { Analytics } from "@vercel/analytics/react";

/**
 * Privacy-friendly page-view analytics (Vercel Web Analytics): no cookies, no
 * cross-site tracking. In production the script loads from this origin
 * (`/_vercel/insights/script.js`), which the page CSP already allows via
 * `script-src 'self'` and `connect-src 'self'`, so no policy change is needed.
 * It only records data once Web Analytics is enabled for the Vercel project.
 */
export function SiteAnalytics() {
  return <Analytics />;
}
