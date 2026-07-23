import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/AccountWorkspace";

const title = "Account continuity";
const description =
  "Optional account continuity for selected Timley browser data, with public jobs, local tracking, and search alerts available without signing in.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/account",
  },
  robots: { index: false, follow: true },
  openGraph: {
    title: `${title} | Timley`,
    description,
    url: "/account",
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

export default function AccountPage() {
  return <AccountWorkspace />;
}
