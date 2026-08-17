import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getJobsRobotsDirective,
  getLegacyJobsRedirect,
} from "@/lib/legacyRouting";

export function proxy(request: NextRequest) {
  const destination = getLegacyJobsRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  const robots = getJobsRobotsDirective(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (robots) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", robots);
    return response;
  }

  if (!destination) return NextResponse.next();

  return NextResponse.redirect(new URL(destination, request.url), 308);
}

export const config = {
  // Keep the normal homepage and canonical board entirely out of Proxy. These
  // explicit matchers run only for legacy/filter URLs that need a redirect or
  // an X-Robots-Tag response header.
  matcher: [
    { source: "/", has: [{ type: "query", key: "tab" }] },
    { source: "/", has: [{ type: "query", key: "q" }] },
    { source: "/", has: [{ type: "query", key: "major" }] },
    { source: "/", has: [{ type: "query", key: "niche" }] },
    { source: "/", has: [{ type: "query", key: "locations" }] },
    { source: "/", has: [{ type: "query", key: "location-order" }] },
    { source: "/", has: [{ type: "query", key: "freshness" }] },
    { source: "/", has: [{ type: "query", key: "collection" }] },
    { source: "/", has: [{ type: "query", key: "sort" }] },
    { source: "/", has: [{ type: "query", key: "stages" }] },
    { source: "/", has: [{ type: "query", key: "remote" }] },
    { source: "/", has: [{ type: "query", key: "visa" }] },
    { source: "/", has: [{ type: "query", key: "min-salary" }] },
    { source: "/jobs", has: [{ type: "query", key: "tab" }] },
    { source: "/jobs", has: [{ type: "query", key: "q" }] },
    { source: "/jobs", has: [{ type: "query", key: "major" }] },
    { source: "/jobs", has: [{ type: "query", key: "niche" }] },
    { source: "/jobs", has: [{ type: "query", key: "locations" }] },
    {
      source: "/jobs",
      has: [{ type: "query", key: "location-order" }],
    },
    { source: "/jobs", has: [{ type: "query", key: "freshness" }] },
    { source: "/jobs", has: [{ type: "query", key: "collection" }] },
    { source: "/jobs", has: [{ type: "query", key: "sort" }] },
    { source: "/jobs", has: [{ type: "query", key: "stages" }] },
    { source: "/jobs", has: [{ type: "query", key: "remote" }] },
    { source: "/jobs", has: [{ type: "query", key: "visa" }] },
    { source: "/jobs", has: [{ type: "query", key: "min-salary" }] },
  ],
};
