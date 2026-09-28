import { NextResponse, type NextRequest } from "next/server";
import { createNonce, pageContentSecurityPolicy } from "@/lib/http/content-security-policy";

/**
 * Give every page render its own script nonce. The framework reads the nonce
 * from this Content-Security-Policy header and stamps it on the inline
 * scripts it emits, so the policy can drop 'unsafe-inline' for scripts.
 *
 * This is the Next.js 16 `proxy.ts` convention on purpose: Vercel treats a
 * root `middleware.ts` in this framework-less project as a separate Edge
 * Routing Middleware, which cannot resolve these imports and fails the
 * deployment. vinext runs `proxy.ts` inside the application bundle instead.
 */
export function proxy(request: NextRequest) {
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
