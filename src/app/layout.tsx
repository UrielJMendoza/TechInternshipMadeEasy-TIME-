import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const description =
  "Live board of Summer/Fall 2027 tech internships and new grad roles, auto-updated from maintained GitHub lists.";

export const metadata: Metadata = {
  title: "TIME — Tech Internships Made Easy",
  description,
  openGraph: {
    title: "TIME — Tech Internships Made Easy",
    description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
