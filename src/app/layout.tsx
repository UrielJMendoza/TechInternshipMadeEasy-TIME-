import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Timley — live tech internship & new grad tracker";
const description =
  "Every 2027 US tech internship and new grad role in one place — deduped, tagged, and refreshed every 2 hours from maintained GitHub lists.";

export const metadata: Metadata = {
  metadataBase: new URL("https://timley.dev"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://timley.dev",
    siteName: "Timley",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
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
