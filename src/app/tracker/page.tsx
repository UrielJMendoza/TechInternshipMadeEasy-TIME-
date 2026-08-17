import type { Metadata } from "next";
import { Tracker } from "@/components/Tracker";

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
    images: ["/og-v2.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Timley`,
    description,
    images: ["/og-v2.png"],
  },
};

export default function TrackerPage() {
  return <Tracker />;
}
