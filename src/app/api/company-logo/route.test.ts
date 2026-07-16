import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompanyLogoHandler,
  normalizeCompanyDomain,
} from "./route";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function fetchImplementation(
  implementation: (
    input: URL | RequestInfo,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}

test("company domains are normalized without accepting URLs, IPs, or private suffixes", () => {
  assert.equal(normalizeCompanyDomain(" USA.Canon.COM "), "usa.canon.com");
  assert.equal(normalizeCompanyDomain("figure.ai"), "figure.ai");

  for (const unsafe of [
    "http://example.com",
    "https://169.254.169.254/latest/meta-data",
    "127.0.0.1",
    "localhost",
    "company.local",
    "company.internal",
    "example.com/path",
    "example.com.",
    "a..com",
  ]) {
    assert.equal(normalizeCompanyDomain(unsafe), null, unsafe);
  }
});

test("invalid input is rejected before any upstream request", async () => {
  let calls = 0;
  const handler = createCompanyLogoHandler(fetchImplementation(async () => {
    calls += 1;
    return new Response(PNG, { headers: { "content-type": "image/png" } });
  }));

  const response = await handler(
    new Request("https://timley.dev/api/company-logo?domain=http%3A%2F%2F127.0.0.1"),
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(calls, 0);
});

test("the proxy fetches only the fixed HTTPS provider and returns a hardened cacheable PNG", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const handler = createCompanyLogoHandler(fetchImplementation(async (input, init) => {
    requests.push({
      url: input instanceof URL ? input : new URL(String(input)),
      init,
    });
    return new Response(PNG, {
      headers: {
        "content-length": String(PNG.byteLength),
        "content-type": "image/png; charset=binary",
      },
    });
  }));

  const response = await handler(
    new Request("https://timley.dev/api/company-logo?domain=usa.canon.com"),
  );

  assert.equal(response.status, 200);
  assert.equal(requests.length, 1);
  const requested = requests[0]!;
  assert.equal(requested.url.origin, "https://favicon.vemetric.com");
  assert.equal(requested.url.pathname, "/usa.canon.com");
  assert.equal(requested.url.searchParams.get("format"), "png");
  assert.equal(requested.init?.redirect, "error");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /s-maxage=604800/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
});

test("non-PNG, forged PNG, and oversized upstream bodies fail closed", async (t) => {
  await t.test("content type", async () => {
    const handler = createCompanyLogoHandler(fetchImplementation(async () =>
      new Response("<svg onload=alert(1) />", {
        headers: { "content-type": "image/svg+xml" },
      })));
    const response = await handler(
      new Request("https://timley.dev/api/company-logo?domain=example.com"),
    );
    assert.equal(response.status, 502);
  });

  await t.test("signature", async () => {
    const handler = createCompanyLogoHandler(fetchImplementation(async () =>
      new Response("not really a png", {
        headers: { "content-type": "image/png" },
      })));
    const response = await handler(
      new Request("https://timley.dev/api/company-logo?domain=example.com"),
    );
    assert.equal(response.status, 502);
  });

  await t.test("streamed size", async () => {
    const oversized = new Uint8Array(256 * 1024 + 1);
    oversized.set(PNG);
    const handler = createCompanyLogoHandler(fetchImplementation(async () =>
      new Response(oversized, {
        headers: { "content-type": "image/png" },
      })));
    const response = await handler(
      new Request("https://timley.dev/api/company-logo?domain=example.com"),
    );
    assert.equal(response.status, 502);
  });
});
