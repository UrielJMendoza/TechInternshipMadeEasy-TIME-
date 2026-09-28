import { NextResponse, type NextRequest } from "next/server";
import { createNonce, pageContentSecurityPolicy } from "@/lib/http/content-security-policy";

/**
 * Give every page render its own script nonce. The framework reads the nonce
 * from this Content-Security-Policy header and stamps it on the inline
 * scripts it emits, so the policy can drop 'unsafe-inline' for scripts.
 */
export function middleware(request: NextRequest) {
  const policy = pageContentSecurityPolicy(createNonce(), {
    secure: request.nextUrl.protocol === "https:",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  // API routes and static files keep the static policy from vercel.json.
  matcher: [
    "/((?!api/|_next/|_vinext/|favicon\\.|icon-|apple-touch-icon|og\\.png|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest).*)",
  ],
};
