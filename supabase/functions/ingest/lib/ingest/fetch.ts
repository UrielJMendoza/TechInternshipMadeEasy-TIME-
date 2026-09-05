import type { SourceFeedDefinition } from "./sourceRegistry.ts";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 2;

export class FeedFetchError extends Error {
  readonly retryable: boolean;
  readonly code:
    | "aborted"
    | "timeout"
    | "network"
    | "http"
    | "content_type"
    | "response_too_large";

  constructor(
    code: FeedFetchError["code"],
    message: string,
    retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FeedFetchError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface FetchFeedOptions {
  timeoutMs?: number;
  maxBytes?: number;
  expectedContentTypes?: readonly string[];
  maxRetries?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface FetchedFeedText {
  text: string;
  bytes: number;
  content_type: string;
  attempts: number;
  final_url: string;
}

function normalizedContentType(value: string | null): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function abortedError(cause?: unknown): FeedFetchError {
  return new FeedFetchError("aborted", "Feed request was aborted", false, {
    cause,
  });
}

async function pauseBeforeRetry(
  milliseconds: number,
  sleep: (milliseconds: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortedError(signal.reason);
  if (!signal) {
    await sleep(milliseconds);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortedError(signal.reason));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    sleep(milliseconds).then(
      () => {
        cleanup();
        resolve();
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number }> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new FeedFetchError(
      "response_too_large",
      `Response declares ${declaredLength} bytes; limit is ${maxBytes}`,
    );
  }

  if (!response.body) return { text: "", bytes: 0 };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("response byte limit exceeded");
        throw new FeedFetchError(
          "response_too_large",
          `Response exceeded ${maxBytes} bytes`,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, bytes };
  } finally {
    reader.releaseLock();
  }
}

async function oneAttempt(
  url: string,
  attempt: number,
  options: Required<
    Pick<
      FetchFeedOptions,
      | "timeoutMs"
      | "maxBytes"
      | "expectedContentTypes"
      | "fetchImpl"
    >
  > &
    Pick<FetchFeedOptions, "signal">,
): Promise<FetchedFeedText> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Feed request timed out", "TimeoutError"));
  }, options.timeoutMs);

  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    let response: Response;
    try {
      response = await options.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: options.expectedContentTypes.join(", "),
          "User-Agent": "timley-ingest/2 (+https://timley.dev)",
        },
      });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new FeedFetchError("aborted", "Feed request was aborted", false, {
          cause: error,
        });
      }
      if (timedOut) {
        throw new FeedFetchError(
          "timeout",
          `Feed request exceeded ${options.timeoutMs}ms`,
          true,
          { cause: error },
        );
      }
      throw new FeedFetchError("network", "Feed request failed", true, {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new FeedFetchError(
        "http",
        `Feed request returned HTTP ${response.status}`,
        retryableStatus(response.status),
      );
    }

    if (response.url) {
      let finalUrl: URL;
      try {
        finalUrl = new URL(response.url);
      } catch (error) {
        throw new FeedFetchError("http", "Feed response URL is invalid", false, {
          cause: error,
        });
      }
      if (finalUrl.protocol !== "https:") {
        throw new FeedFetchError(
          "http",
          "Feed response redirected away from HTTPS",
        );
      }
    }

    const contentType = normalizedContentType(
      response.headers.get("content-type"),
    );
    if (
      !contentType ||
      !options.expectedContentTypes.some(
        (expected) => expected.toLowerCase() === contentType,
      )
    ) {
      throw new FeedFetchError(
        "content_type",
        `Unexpected content type ${contentType || "(missing)"}`,
      );
    }

    let body: { text: string; bytes: number };
    try {
      body = await readBoundedBody(response, options.maxBytes);
    } catch (error) {
      if (error instanceof FeedFetchError) throw error;
      if (options.signal?.aborted) throw abortedError(error);
      if (timedOut) {
        throw new FeedFetchError(
          "timeout",
          `Feed request exceeded ${options.timeoutMs}ms`,
          true,
          { cause: error },
        );
      }
      throw new FeedFetchError("network", "Feed response body read failed", true, {
        cause: error,
      });
    }
    return {
      ...body,
      content_type: contentType,
      attempts: attempt,
      final_url: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function fetchFeedText(
  url: string,
  options: FetchFeedOptions = {},
): Promise<FetchedFeedText> {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(url);
  } catch (error) {
    throw new FeedFetchError("http", "Feed URL is invalid", false, {
      cause: error,
    });
  }
  if (sourceUrl.protocol !== "https:") {
    throw new FeedFetchError("http", "Feed URL must use HTTPS");
  }

  const requestedRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxRetries = Number.isFinite(requestedRetries)
    ? Math.min(
        DEFAULT_MAX_RETRIES,
        Math.max(0, Math.floor(requestedRetries)),
      )
    : DEFAULT_MAX_RETRIES;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? wait;
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const resolved = {
    timeoutMs,
    maxBytes: positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES),
    expectedContentTypes:
      options.expectedContentTypes ?? (["text/plain"] as const),
    fetchImpl: options.fetchImpl ?? fetch,
    signal: options.signal,
  };
  const deadline = Date.now() + timeoutMs;

  let lastError: FeedFetchError | null = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new FeedFetchError(
        "timeout",
        `Feed request exceeded ${timeoutMs}ms total deadline`,
        true,
        { cause: lastError ?? undefined },
      );
    }
    try {
      return await oneAttempt(url, attempt, {
        ...resolved,
        timeoutMs: remainingMs,
      });
    } catch (error) {
      const feedError =
        error instanceof FeedFetchError
          ? error
          : new FeedFetchError("network", "Feed request failed", true, {
              cause: error,
            });
      lastError = feedError;
      if (!feedError.retryable || attempt > maxRetries) throw feedError;

      // 150–450ms, 300–900ms. The injected random/sleep hooks keep tests fast
      // and deterministic without weakening production jitter.
      const base = 150 * 2 ** (attempt - 1);
      const delay = Math.round(base + base * 2 * random());
      const retryBudgetMs = deadline - Date.now();
      if (retryBudgetMs <= 0 || delay >= retryBudgetMs) {
        if (retryBudgetMs > 0) {
          await pauseBeforeRetry(retryBudgetMs, sleep, options.signal);
        }
        throw new FeedFetchError(
          "timeout",
          `Feed request exceeded ${timeoutMs}ms total deadline`,
          true,
          { cause: feedError },
        );
      }
      await pauseBeforeRetry(delay, sleep, options.signal);
    }
  }

  throw lastError ?? new FeedFetchError("network", "Feed request failed");
}

export function fetchRegisteredFeed(
  feed: SourceFeedDefinition,
  options: Omit<
    FetchFeedOptions,
    "maxBytes" | "expectedContentTypes"
  > = {},
): Promise<FetchedFeedText> {
  return fetchFeedText(feed.url, {
    ...options,
    maxBytes: feed.max_response_bytes,
    expectedContentTypes: feed.expected_content_types,
  });
}
