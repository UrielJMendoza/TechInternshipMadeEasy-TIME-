/** Reject state-changing browser requests that another site initiated. */
export function isCrossSiteRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return true;
  return request.headers.get("sec-fetch-site") === "cross-site";
}

/**
 * HTML forms cannot send `application/json` without a CORS preflight, so
 * requiring it closes the simple-request CSRF path even without an Origin.
 */
export function hasJsonContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}
