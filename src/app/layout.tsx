import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIME — Tech Internships Made Easy",
  description:
    "Live board of Summer/Fall 2027 tech internships and new grad roles, auto-updated from maintained GitHub lists.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
