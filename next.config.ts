import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render metadata in <head> for every visitor, Googlebot included, instead
  // of streaming it into <body>. Job metadata reads the same cached snapshot
  // as the page, so blocking costs nothing and every crawler sees it.
  htmlLimitedBots: /.*/,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "favicon.vemetric.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
