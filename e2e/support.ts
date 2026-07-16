import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

export const JOB_ROW = '[data-testid="job-row"]';
export const JOBS_PATH = "/api/jobs";

// 1x1 opaque PNG. Intercepting the local Next image-optimizer request keeps
// browser CI from causing the server-side logo proxy to call its live provider.
const PNG_PLACEHOLDER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export function isJobsRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === JOBS_PATH && request.method() === "POST";
}

export function jobsRequestBody(request: Request): Record<string, unknown> {
  const body: unknown = request.postDataJSON();
  expect(body, "Expected /api/jobs to receive a JSON object").toEqual(
    expect.any(Object),
  );
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Expected /api/jobs to receive a JSON object");
  }
  return body as Record<string, unknown>;
}

export async function expectBoardSettled(page: Page): Promise<void> {
  await expect(page.locator("[data-job-list]")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 20_000 },
  );
}

/** Keep required browser tests deterministic and prevent navigation to live job sites. */
export async function stubExternalBrowserRequests(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const applicationOrigin = new URL(baseURL).origin;

  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isLocal =
      url.origin === applicationOrigin ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost";

    const optimizedSource = url.pathname === "/_next/image"
      ? url.searchParams.get("url")
      : null;
    const isCompanyLogoRequest =
      isLocal &&
      (url.pathname === "/api/company-logo" ||
        optimizedSource?.startsWith("/api/company-logo?") === true);

    if (isCompanyLogoRequest) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PNG_PLACEHOLDER,
        headers: { "Cache-Control": "public, max-age=3600" },
      });
      return;
    }

    if (isLocal) {
      await route.continue();
      return;
    }

    if (request.resourceType() === "document") {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>External listing test stub</title><p>External listing</p>",
      });
      return;
    }

    if (request.resourceType() === "image") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PNG_PLACEHOLDER,
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });
}

export async function openBoard(page: Page): Promise<Response> {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  const hydratedJobsResponse = page.waitForResponse(
    (response) => isJobsRequest(response.request()),
    { timeout: 20_000 },
  );
  const [response, jobsResponse] = await Promise.all([
    page.goto("/", { waitUntil: "domcontentloaded" }),
    hydratedJobsResponse,
  ]);
  expect(response, "The board navigation should return an HTTP response").not.toBeNull();
  expect(response?.ok(), `Board returned HTTP ${response?.status()}`).toBe(true);
  expect(
    jobsResponse.ok(),
    `Hydration /api/jobs request returned HTTP ${jobsResponse.status()}`,
  ).toBe(true);

  await expect(page.getByRole("heading", { level: 1, name: /timley/i })).toBeVisible();
  await expectBoardSettled(page);
  await expect(page.locator(JOB_ROW).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  return response!;
}

export function firstJob(page: Page): Locator {
  return page.locator(JOB_ROW).first();
}

export function applyLink(job: Locator): Locator {
  return job.getByRole("link", { name: /^apply\b/i }).first();
}

export function saveButton(job: Locator): Locator {
  return job.getByRole("button", { name: /add to to apply|remove from to apply/i });
}

export function trackButton(job: Locator): Locator {
  return job.getByRole("button", { name: /application stage for/i });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `Page scroll width ${dimensions.scrollWidth}px exceeds client width ${dimensions.clientWidth}px`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectInsideViewport(
  locator: Locator,
  page: Page,
  padding = 0,
): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "Expected an element with a layout box").not.toBeNull();
  expect(viewport, "Expected a configured viewport").not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x).toBeGreaterThanOrEqual(padding - 1);
  expect(box.y).toBeGreaterThanOrEqual(padding - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - padding + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - padding + 1);
}

export async function attachViewportScreenshot(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<void> {
  await testInfo.attach(`${testInfo.project.name}-${label}.png`, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

export function projectBaseURL(testInfo: TestInfo): string {
  const configured = testInfo.project.use.baseURL;
  if (typeof configured !== "string") {
    throw new Error("Playwright baseURL must be configured for browser tests");
  }
  return configured;
}

export async function storageSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith("timley:")))
        .map((key) => [key, localStorage.getItem(key) ?? ""]),
    ),
  );
}
