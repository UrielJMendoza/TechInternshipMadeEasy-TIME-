const FAQ_ITEMS = [
  {
    question: "What is Timley?",
    answer:
      "Timley is a job-discovery and application-tracking platform for internships and new-grad roles. It brings active listings, evidence, saving, and application stages into one workspace.",
  },
  {
    question: "Where do listings come from?",
    answer:
      "Listings are collected from public, community-maintained GitHub job lists. Timley normalizes and deduplicates them; the source catalog and exact links are documented in the Methodology.",
  },
  {
    question: "How often are jobs refreshed?",
    answer:
      "The checked-in deployment schedules ingestion daily, while listing pages can revalidate their displayed snapshot every five minutes. The Data Status page shows the latest active observations without overstating source-run health.",
  },
  {
    question: "Does Timley require an account?",
    answer:
      "No. Browsing jobs, saving roles, saved searches, in-app alerts, and the tracker remain anonymous and browser-local. On deployments where account continuity is configured, signing in is optional and does not upload anything by itself. Your first sync asks which data categories to include, and the tracker choice explicitly warns that it includes personal notes and optional contact details.",
  },
  {
    question: "Where is tracker data stored?",
    answer:
      "Saved roles, application records, notes, optional contacts, saved searches, alerts, and preferences start in your browser. Timley does not silently upload them. If you explicitly sync selected categories, the configured Supabase project stores one account snapshot; signing out leaves the browser copy in place. You can still create a manual JSON backup.",
  },
  {
    question: "How do backups, exports, and reminders work?",
    answer:
      "JSON backup, CSV, and ICS are local downloads you choose to create. JSON includes application records, notes, optional contacts, and saved-job URLs. A calendar app receives event details only when you import an ICS file. Tracker reminders and saved-search browser alerts are foreground-only and request permission only after you explicitly enable them. Saved-search checks run only while the Alerts page is open. Email alerts are not available.",
  },
  {
    question: "How do saved-search alerts work?",
    answer:
      "Saved searches can run on each fresh check, daily, weekly, or stay paused. While the Alerts page is open, Timley refreshes its server jobs snapshot about every five minutes and when the page returns to focus. Local delivery history explains why each in-app or browser-only role matched, names the triggering search, links to filtered results, and deduplicates a role across searches. You can pause or unsubscribe from each search. Browser notices are optional and foreground-only; email delivery is scaffolded but unavailable.",
  },
  {
    question: "What does optional account continuity do?",
    answer:
      "When a deployment has Supabase authentication, database policies, email delivery, and redirect URLs configured, you can explicitly sync selected browser-data categories. Merge keeps the newest application record per role and unions set-like data. Timley saves the merged cloud snapshot before replacing local data, so a failed cloud save leaves your browser copy recoverable. After first-sync consent, selected changes can sync while Timley is open. Sign-out leaves local data; account deletion and anonymous product-data clearing are separate choices.",
  },
  {
    question: "How are salary estimates labeled?",
    answer:
      "Pay copied from a source listing appears without an estimate label. When a listing has no pay, Timley may show a broad US category range prefixed with “Est.” and explains that it is not employer-provided.",
  },
  {
    question: "How is sponsorship information determined?",
    answer:
      "Timley carries explicit sponsorship or restriction details from the source data. When the source does not say, the product shows sponsorship as unknown instead of guessing.",
  },
  {
    question: "Is Timley an AI career platform?",
    answer:
      "No. Timley focuses on job discovery and application organization. It does not provide AI resume scoring, interview coaching, career chatbots, automated networking, or generic AI career advice.",
  },
] as const;

export function LandingFaq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="theme-application bg-surface py-20 sm:py-24 lg:py-28"
    >
      <div className="landing-reveal mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(32rem,1fr)] lg:gap-16 lg:px-8">
        <div>
          <p className="landing-section-kicker">FAQ</p>
          <h2 id="faq-title" className="landing-section-title mt-4">
            Practical answers, plainly stated.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
            The short version: public browsing, transparent evidence, and a
            browser-local tracker with optional, deliberate continuity.
          </p>
        </div>

        <div className="landing-faq-list">
          {FAQ_ITEMS.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <span aria-hidden>+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
