import type { Metadata, Viewport } from "next";
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
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
