import type { Metadata } from "next";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/fragment-mono/400.css";
import "./globals.css";

const title = "Timley | Internships and new-grad jobs";
const description = "Search internships and new-grad jobs by major, location, and work style. No account required.";

export const metadata: Metadata = {
  metadataBase: new URL("https://timley.dev"),
  title,
  description,
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "64x64" }],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "Timley",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Timley internships and new-grad job index" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
