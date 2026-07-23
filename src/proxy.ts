import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLegacyJobsRedirect } from "@/lib/legacyRouting";

export function proxy(request: NextRequest) {
  const destination = getLegacyJobsRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );

  if (!destination) return NextResponse.next();

  return NextResponse.redirect(new URL(destination, request.url), 308);
}

export const config = {
  matcher: ["/"],
};
