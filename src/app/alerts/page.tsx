import type { Metadata } from "next";
import { AlertsWorkspace } from "@/components/AlertsWorkspace";
import { fetchJobsSnapshot } from "@/lib/jobs";

const title = "Search alerts";
const description =
  "Manage saved searches, local in-app alerts, and optional foreground browser notifications without an account.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/alerts",
  },
  robots: { index: false, follow: true },
  openGraph: {
    title: `${title} | Timley`,
    description,
    url: "/alerts",
    type: "website",
    images: ["/og-v2.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Timley`,
    description,
    images: ["/og-v2.png"],
  },
};

export const revalidate = 86400;

export default async function AlertsPage() {
  const snapshot = await fetchJobsSnapshot();
  return <AlertsWorkspace {...snapshot} />;
}
