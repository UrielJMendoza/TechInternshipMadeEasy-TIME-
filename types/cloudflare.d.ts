/** Minimal bindings used by the local Sites worker when Cloudflare globals are absent. */
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
