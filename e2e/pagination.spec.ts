import { expect, test, type Page, type Request } from "@playwright/test";
import {
  JOB_ROW,
  expectBoardSettled,
  isJobsRequest,
  jobsRequestBody,
  openBoard,
  projectBaseURL,
  stubExternalBrowserRequests,
} from "./support";

async function clickLoadMoreAndCaptureRequest(page: Page): Promise<Request> {
  const requestPromise = page.waitForRequest(isJobsRequest, { timeout: 10_000 });
  await page.getByTestId("load-more").click();
  return requestPromise;
}

function hasCursor(request: Request): boolean {
  const cursor = jobsRequestBody(request).cursor;
  return typeof cursor === "string" && cursor.length > 0;
}

test.beforeEach(async ({ context }, testInfo) => {
  await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
});

test("initial payload remains bounded with at least 3,000 fixture jobs @desktop", async ({ page }) => {
  const response = await openBoard(page);
  const roleCountText = await page.locator("header").getByText(/open roles/i).textContent();
  const totalRoles = Number((roleCountText ?? "").replace(/[^0-9]/g, ""));
  expect(totalRoles, "The CI performance seed must contain at least 3,000 jobs").toBeGreaterThanOrEqual(3_000);

  const initialRows = await page.locator(JOB_ROW).count();
  expect(initialRows).toBeGreaterThan(0);
  expect(initialRows, "Initial rendering must be limited to one server page").toBeLessThanOrEqual(60);

  const maximumDocumentBytes = Number(process.env.E2E_MAX_INITIAL_DOCUMENT_BYTES ?? 350_000);
  const documentBytes = (await response.body()).byteLength;
  expect(
    documentBytes,
    `Initial HTML/RSC payload was ${documentBytes} bytes; budget is ${maximumDocumentBytes}`,
  ).toBeLessThanOrEqual(maximumDocumentBytes);
});

test("Load more expands results through POST with an opaque cursor @desktop", async ({ page }) => {
  await openBoard(page);

  const rows = page.locator(JOB_ROW);
  const initialCount = await rows.count();
  const loadMore = page.getByTestId("load-more");
  await expect(loadMore).toBeVisible();

  const request = await clickLoadMoreAndCaptureRequest(page);
  await expect.poll(() => rows.count()).toBeGreaterThan(initialCount);
  expect(request.method()).toBe("POST");
  expect(jobsRequestBody(request)).toEqual(
    expect.objectContaining({ cursor: expect.stringMatching(/\S+/) }),
  );
  expect(new URL(request.url()).pathname).toBe("/api/jobs");
});

test("network pagination exposes retry and recovers after a transient failure @desktop", async ({ page }) => {
  await openBoard(page);

  let injectedFailure = false;
  let paginationAttempts = 0;
  await page.route(
    (url) => url.pathname === "/api/jobs",
    async (route) => {
      if (!hasCursor(route.request())) {
        await route.continue();
        return;
      }
      paginationAttempts += 1;
      if (!injectedFailure) {
        injectedFailure = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "transient e2e failure" }),
        });
        return;
      }
      await route.continue();
    },
  );

  const rows = page.locator(JOB_ROW);
  const before = await rows.count();
  await page.getByTestId("load-more").click();
  const retry = page.getByRole("button", { name: /retry|try again/i });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect.poll(() => rows.count()).toBeGreaterThan(before);
  expect(injectedFailure).toBe(true);
  expect(paginationAttempts, "Retry should repeat exactly the failed cursor request").toBe(2);
});

test("network pagination reaches exhaustion without requesting another page @desktop", async ({ page }) => {
  test.setTimeout(60_000);
  await openBoard(page);
  const remoteOnly = page.getByRole("switch", { name: /Remote Only/i });
  const filteredResponse = page.waitForResponse((response) => {
    if (!isJobsRequest(response.request())) return false;
    const body = jobsRequestBody(response.request());
    return body.remoteOnly === true && body.cursor === null;
  });
  await remoteOnly.click();
  const response = await filteredResponse;
  expect(response.ok(), `Remote-only query returned HTTP ${response.status()}`).toBe(true);
  const filteredPage = await response.json() as { total?: unknown };
  expect(filteredPage.total, "The deterministic fixture should expose 600 remote internships").toBe(600);
  await expectBoardSettled(page);
  await expect(remoteOnly).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("load-more")).toBeVisible();

  const firstRequest = await clickLoadMoreAndCaptureRequest(page);
  expect(hasCursor(firstRequest)).toBe(true);

  let requestCount = 1;
  page.on("request", (request) => {
    if (isJobsRequest(request)) requestCount += 1;
  });

  const rows = page.locator(JOB_ROW);
  for (let pageNumber = 0; pageNumber < 40; pageNumber += 1) {
    const loadMore = page.getByTestId("load-more");
    if (!(await loadMore.isVisible().catch(() => false))) break;
    const before = await rows.count();
    await loadMore.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
  }

  await expect(page.getByTestId("load-more")).toBeHidden();
  await expect(page.getByText(/all \d[\d,]* roles? loaded|no more roles/i)).toBeVisible();
  const exhaustedRequestCount = requestCount;
  await page.waitForTimeout(500);
  expect(requestCount, "Exhaustion must not trigger background page requests").toBe(exhaustedRequestCount);
});
