import type { Metadata, Viewport } from "next";
import { ContinuityProvider } from "@/components/ContinuityProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StructuredData } from "@/components/StructuredData";
import { OG_IMAGE, SITE_URL, siteIdentityJsonLd } from "@/lib/seo";
import "./globals.css";

const title = "Timley | job discovery and application tracking";
const description =
  "Fresh internships and new-grad roles, with a built-in application tracker. No account required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: "%s | Timley",
  },
  description,
  openGraph: {
    title,
    description,
    siteName: "Timley",
    type: "website",
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [OG_IMAGE.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F0E7",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ContinuityProvider>
          <StructuredData data={siteIdentityJsonLd()} />
          <a
            href="#main-content"
            className="theme-application ui-button ui-button--primary fixed top-3 left-3 z-[var(--layer-skip-link)] -translate-y-24 focus:translate-y-0 motion-reduce:transition-none"
          >
            Skip to main content
          </a>
          <SiteHeader />
          {children}
          <SiteFooter />
        </ContinuityProvider>
      </body>
    </html>
  );
}
