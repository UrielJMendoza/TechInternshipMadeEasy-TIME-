import type { Metadata } from "next";
import { SavedJobs } from "@/app/components/SavedJobs";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Saved jobs · Timley",
  description: "Jobs you saved locally on this device. No Timley account required.",
};

export default function SavedPage() {
  return (
    <main id="main-content">
      <SiteHeader active="saved" />
      <section className="page-intro saved-intro">
        <div>
          <h1>Saved jobs</h1>
        </div>
        <p>Stored only in this browser. Nothing is uploaded, and clearing browser data clears the list.</p>
      </section>
      <div className="content-shell saved-shell">
        <SavedJobs />
      </div>
      <SiteFooter />
    </main>
  );
}
