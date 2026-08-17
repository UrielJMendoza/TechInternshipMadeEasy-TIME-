const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function validateContentType(url: string, contentType: string | null): void {
  if (!contentType) return;

  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    throw new Error(`GET ${url} returned HTML instead of a feed`);
  }
  if (
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType.endsWith("+json") ||
    mediaType === "application/octet-stream"
  ) {
    return;
  }

  throw new Error(`GET ${url} returned unsupported content type ${mediaType}`);
}

function validateBody(url: string, text: string): string {
  const leading = text.trimStart().slice(0, 64).toLowerCase();
  if (!leading) throw new Error(`GET ${url} returned an empty response`);
  if (leading.startsWith("<!doctype html") || leading.startsWith("<html")) {
    throw new Error(`GET ${url} returned HTML instead of a feed`);
  }
  return text;
}

/**
 * Fetch a public source document without allowing a slow or unexpectedly large
 * response to consume the whole ingestion invocation. Source parsers still own
 * format validation (JSON vs Markdown); this boundary validates transport.
 */
export async function fetchText(
  url: string,
  options: FetchTextOptions = {},
): Promise<string> {
  const timeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxBytes = positiveLimit(options.maxBytes, DEFAULT_MAX_BYTES);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "internship-tracker (github.com/UrielJMendoza)" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);

    validateContentType(url, response.headers.get("content-type"));

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`GET ${url} exceeded the ${maxBytes}-byte response limit`);
    }

    if (!response.body) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new Error(`GET ${url} exceeded the ${maxBytes}-byte response limit`);
      }
      return validateBody(url, text);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        controller.abort();
        throw new Error(`GET ${url} exceeded the ${maxBytes}-byte response limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    return validateBody(url, text);
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof Error && /response limit/.test(error.message))) {
      throw new Error(`GET ${url} timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const feedFetchLimits = {
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES,
} as const;
