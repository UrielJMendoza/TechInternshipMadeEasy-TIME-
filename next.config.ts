import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
