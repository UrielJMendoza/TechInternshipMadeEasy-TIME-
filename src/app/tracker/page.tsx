import type { Metadata } from "next";
import { Tracker } from "@/components/Tracker";
import { fetchJobsSnapshot } from "@/lib/jobs";

const title = "Application workspace";
const description =
  "Organize applications, next actions, interviews, notes, reminders, and backups in a private browser-based workspace.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/tracker",
  },
  robots: { index: false, follow: true },
  openGraph: {
    title: `${title} | Timley`,
    description,
    url: "/tracker",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Timley`,
    description,
    images: ["/og.png"],
  },
};

export const revalidate = 300;

export default async function TrackerPage() {
  const snapshot = await fetchJobsSnapshot();
  return <Tracker {...snapshot} />;
}
