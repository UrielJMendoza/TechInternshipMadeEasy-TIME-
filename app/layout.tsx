import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/hanken-grotesk/wght.css";
import "@fontsource/fragment-mono/400.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const forwardedProtocol = incoming.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Timley | Internships and new-grad jobs";
  const description = "Search internships and new-grad jobs by major, location, and work style. No account required.";
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
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
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Timley internships and new-grad job index" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

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
