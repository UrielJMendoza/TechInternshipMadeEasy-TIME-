const LOGO_PROVIDER_ORIGIN = "https://favicon.vemetric.com";
const LOGO_CACHE_SECONDS = 60 * 60 * 24 * 7;
const NEGATIVE_CACHE_SECONDS = 60 * 60;
const MAX_LOGO_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 3_500;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FetchImplementation = typeof fetch;

/**
 * Accept only an ASCII DNS hostname. The value is never fetched directly: it
 * is passed as an encoded path segment to the fixed logo-provider origin.
 */
export function normalizeCompanyDomain(value: string | null): string | null {
  if (!value) return null;

  const domain = value.trim().toLowerCase();
  if (!domain || domain.length > 253 || domain.endsWith(".")) return null;
  if (/^[\d.]+$/.test(domain)) return null;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) {
    return null;
  }

  const topLevelDomain = labels.at(-1)!;
  if (/^\d+$/.test(topLevelDomain)) return null;
  if (["internal", "invalid", "lan", "local", "localhost", "test"].includes(topLevelDomain)) {
    return null;
  }

  return domain;
}

function providerUrl(domain: string): URL {
  const url = new URL(LOGO_PROVIDER_ORIGIN);
  url.pathname = `/${encodeURIComponent(domain)}`;
  url.searchParams.set("size", "128");
  url.searchParams.set("format", "png");

  if (url.protocol !== "https:" || url.origin !== LOGO_PROVIDER_ORIGIN) {
    throw new Error("invalid logo provider configuration");
  }

  return url;
}

async function readBoundedBody(response: Response): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGO_BYTES) {
    throw new Error("logo exceeds size limit");
  }
  if (!response.body) throw new Error("logo response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_LOGO_BYTES) {
        await reader.cancel("logo exceeds size limit");
        throw new Error("logo exceeds size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total < PNG_SIGNATURE.length) throw new Error("empty or invalid logo");

  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("logo payload is not a PNG");
  }

  return buffer;
}

function emptyResponse(status: number, cacheControl: string): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function createCompanyLogoHandler(fetchLogo: FetchImplementation = fetch) {
  return async function handle(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    const domain = normalizeCompanyDomain(requestUrl.searchParams.get("domain"));
    if (!domain) return emptyResponse(400, "private, no-store");

    let upstream: Response;
    try {
      const init: RequestInit & { next: { revalidate: number } } = {
        cache: "force-cache",
        headers: {
          Accept: "image/png",
          "User-Agent": "timley-logo-proxy/1.0",
        },
        redirect: "error",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        next: { revalidate: LOGO_CACHE_SECONDS },
      };
      upstream = await fetchLogo(providerUrl(domain), init);
    } catch {
      return emptyResponse(
        502,
        `public, max-age=60, s-maxage=${NEGATIVE_CACHE_SECONDS}`,
      );
    }

    if (!upstream.ok) {
      return emptyResponse(
        upstream.status === 404 ? 404 : 502,
        `public, max-age=300, s-maxage=${NEGATIVE_CACHE_SECONDS}`,
      );
    }

    const contentType = upstream.headers.get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "image/png") {
      return emptyResponse(502, "public, max-age=60, s-maxage=300");
    }

    try {
      const body = await readBoundedBody(upstream);
      return new Response(body, {
        headers: {
          "Cache-Control": `public, max-age=86400, s-maxage=${LOGO_CACHE_SECONDS}, stale-while-revalidate=2592000`,
          "Content-Disposition": "inline",
          "Content-Length": String(body.byteLength),
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Type": "image/png",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return emptyResponse(502, "public, max-age=60, s-maxage=300");
    }
  };
}

export const GET = createCompanyLogoHandler();
