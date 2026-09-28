/**
 * Page policy. Scripts must come from this origin or carry the per-request
 * nonce, so an injected inline script cannot run. Inline styles stay allowed
 * because React style attributes need them; styles cannot execute code.
 */
export function pageContentSecurityPolicy(nonce: string, { secure = true }: { secure?: boolean } = {}): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https://favicon.vemetric.com",
    "manifest-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
  ];
  // Upgrading would break plain-HTTP local development; production is HTTPS.
  if (secure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** A fresh 128-bit base64 nonce; base64 never contains HTML-escape characters. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
