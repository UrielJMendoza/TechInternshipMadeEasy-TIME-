import {
  expect,
  test,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import {
  JOB_ROW,
  applyLink,
  expectBoardSettled,
  firstJob,
  isJobsRequest,
  jobsRequestBody,
  openBoard,
  projectBaseURL,
  saveButton,
  storageSnapshot,
  stubExternalBrowserRequests,
  trackButton,
} from "./support";

async function expectListingNavigation(page: Page, link: Locator): Promise<void> {
  const expectedHref = await link.getAttribute("href");
  expect(expectedHref).toBeTruthy();
  const expected = new URL(expectedHref!, page.url());
  const originalURL = page.url();
  const popupPromise = page.waitForEvent("popup", { timeout: 2_500 }).catch(() => null);

  await link.click();
  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded");
    expect(new URL(popup.url()).origin).toBe(expected.origin);
    await popup.close();
  } else {
    await expect(page).not.toHaveURL(originalURL);
    expect(new URL(page.url()).origin).toBe(expected.origin);
  }
}

function waitForJobsResponse(
  page: Page,
  matches: (body: Record<string, unknown>) => boolean,
): Promise<Response> {
  return page.waitForResponse((response) =>
    isJobsRequest(response.request()) && matches(jobsRequestBody(response.request())),
  );
}

test.describe("job-card semantics and controls", () => {
  test.beforeEach(async ({ context, page }, testInfo) => {
    await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
    await openBoard(page);
  });

  test("the visible role heading is the canonical listing link @desktop", async ({ page }) => {
    const job = firstJob(page);
    await expect(job).toHaveAccessibleName(/\S+/);

    const titleLink = job.getByRole("link", { name: /open listing/i }).first();
    await expect(titleLink, "The visible company/title block should be the canonical link").toBeVisible();
    const heading = titleLink.getByRole("heading").first();
    await expect(heading, "The linked role title should be a heading").toBeVisible();
    await expect(job.locator("time[datetime]")).toBeVisible();
    await expectListingNavigation(page, titleLink);
  });

  test("verified company domains render through the local logo proxy path @desktop", async ({ page }) => {
    const logo = firstJob(page).locator("img").first();
    await expect(logo).toBeAttached();
    const src = await logo.getAttribute("src");
    expect(src, "A verified fixture domain should render a real logo image").toBeTruthy();

    const imageUrl = new URL(src!, page.url());
    const proxiedSource = imageUrl.pathname === "/_next/image"
      ? imageUrl.searchParams.get("url")
      : `${imageUrl.pathname}${imageUrl.search}`;
    expect(proxiedSource).toBe("/api/company-logo?domain=example.com");
  });

  test("To apply and Track never open the listing @phone-desktop", async ({ page }) => {
    const openedPages: Page[] = [];
    page.on("popup", (popup) => openedPages.push(popup));
    const originalURL = page.url();
    const job = firstJob(page);

    const save = saveButton(job);
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    expect(page.url()).toBe(originalURL);

    const track = trackButton(job);
    await track.click();
    await expect(page.getByRole("menu", { name: /application stage for/i })).toBeVisible();
    expect(page.url()).toBe(originalURL);
    expect(openedPages, "To apply/Track controls must not create listing popups").toHaveLength(0);
  });

  test("internship term filters send normalized keys and only show matching roles @phone-desktop", async ({ page }) => {
    const isMobile = (page.viewportSize()?.width ?? 0) < 1024;
    let filterContainer: Locator;

    if (isMobile) {
      await page.getByRole("button", { name: /^Filters(?:\s+\d+)?$/ }).click();
      filterContainer = page.getByRole("dialog", { name: "Filters and sorting" });
    } else {
      await page.getByRole("button", { name: "Term", exact: true }).click();
      filterContainer = page.getByRole("dialog", { name: "Term" });
    }

    await expect(filterContainer).toBeVisible();
    const fall2026 = filterContainer.getByRole("checkbox", { name: /^Fall 2026\b/ });
    await expect(fall2026).toBeVisible();
    await expect(filterContainer.getByRole("checkbox", { name: /^Summer 2027\b/ })).toBeVisible();
    await expect(filterContainer.getByRole("checkbox", { name: /^Term not listed\b/ })).toBeVisible();

    let responsePromise: Promise<Response>;
    if (isMobile) {
      await fall2026.check();
      responsePromise = waitForJobsResponse(
        page,
        (body) => body.cursor === null && JSON.stringify(body.termKeys) === '["fall-2026"]',
      );
      await filterContainer.getByRole("button", { name: "Apply filters" }).click();
    } else {
      responsePromise = waitForJobsResponse(
        page,
        (body) => body.cursor === null && JSON.stringify(body.termKeys) === '["fall-2026"]',
      );
      await fall2026.check();
    }

    const response = await responsePromise;
    expect(response.ok(), `Term-filter query returned HTTP ${response.status()}`).toBe(true);
    expect(jobsRequestBody(response.request())).toEqual(
      expect.objectContaining({ cursor: null, termKeys: ["fall-2026"] }),
    );
    await expectBoardSettled(page);
    await expect(page).toHaveURL(/(?:\?|&)terms=fall-2026(?:&|$)/);
    await expect(page.getByRole("button", { name: "Remove Fall 2026 filter" })).toBeVisible();

    const badges = page.locator(`${JOB_ROW} [data-testid="job-term-badges"]`);
    await expect(badges.first()).toBeVisible();
    const visibleTermKeys = await badges.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-term-keys") ?? ""),
    );
    expect(visibleTermKeys.length).toBeGreaterThan(0);
    expect(
      visibleTermKeys.every((keys) => keys.split(",").includes("fall-2026")),
      `Every returned role should include fall-2026; received ${visibleTermKeys.join(" | ")}`,
    ).toBe(true);
  });

  test("To apply isolates starred roles and updates when a star is removed @phone-desktop", async ({ page }) => {
    const job = firstJob(page);
    const trackingKey = await job.getAttribute("data-tracking-key");
    expect(trackingKey, "The starred role must expose a tracking key").toMatch(/\S+/);

    const addToApply = saveButton(job);
    await expect(addToApply).toHaveAccessibleName("Add to To apply");
    await addToApply.click();
    await expect(addToApply).toHaveAccessibleName("Remove from To apply");
    await expect(addToApply).toHaveAttribute("aria-pressed", "true");

    const savedResponsePromise = waitForJobsResponse(
      page,
      (body) =>
        body.cursor === null &&
        Array.isArray(body.trackingKeys) &&
        body.trackingKeys.length === 1 &&
        body.trackingKeys[0] === trackingKey,
    );

    if ((page.viewportSize()?.width ?? 0) < 1024) {
      await page.getByRole("button", { name: /^Filters(?:\s+\d+)?$/ }).click();
      const sheet = page.getByRole("dialog", { name: "Filters and sorting" });
      await sheet.getByRole("button", { name: "To apply", exact: true }).click();
      await sheet.getByRole("button", { name: "Apply filters" }).click();
    } else {
      const collection = page.getByRole("group", { name: "Job collection" });
      await collection.getByRole("button", { name: /^To apply(?:\s+\d+)?$/ }).click();
    }

    const savedResponse = await savedResponsePromise;
    expect(savedResponse.ok(), `To apply query returned HTTP ${savedResponse.status()}`).toBe(true);
    await expectBoardSettled(page);
    await expect(page).toHaveURL(/(?:\?|&)collection=saved(?:&|$)/);

    const rows = page.locator(JOB_ROW);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-tracking-key", trackingKey!);

    const emptyResponsePromise = waitForJobsResponse(
      page,
      (body) => body.cursor === null && Array.isArray(body.trackingKeys) && body.trackingKeys.length === 0,
    );
    await saveButton(rows.first()).click();
    const emptyResponse = await emptyResponsePromise;
    expect(emptyResponse.ok(), `Empty To apply query returned HTTP ${emptyResponse.status()}`).toBe(true);
    await expectBoardSettled(page);
    await expect(rows).toHaveCount(0);
    await expect(page.getByText(/No To apply roles match these filters/i)).toBeVisible();
  });

  test("Track supports keyboard navigation, selection, Escape, and focus restoration @desktop", async ({ page }) => {
    const trigger = trackButton(firstJob(page));
    await trigger.focus();
    await page.keyboard.press("Enter");

    const menu = page.getByRole("menu", { name: /application stage for/i });
    await expect(menu).toBeVisible();
    const options = menu.getByRole("menuitemradio");
    await expect(options).toHaveCount(6);
    await expect(options.filter({ hasText: "Not applied" })).toBeFocused();

    await page.keyboard.press("End");
    await expect(options.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(options.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Space");
    await expect(menu).toBeVisible();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName(/Offer application stage/i);
  });

  test("Apply remains visible in dense/table view @desktop", async ({ page }) => {
    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.getByRole("button", { name: "Table view" })).toHaveAttribute("aria-pressed", "true");
    await expect(applyLink(firstJob(page))).toBeVisible();
  });

  test("desktop filter popovers close when keyboard focus leaves @desktop", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Locations", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Locations" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("label").filter({ hasText: "Denver, CO" })).toContainText("750");
    await expect(dialog.locator("label").filter({ hasText: "New York, NY" })).toContainText("600");
    await expect(dialog.locator("label").filter({ hasText: "Austin, TX" })).toContainText("750");

    const focusable = dialog.locator("button:not([disabled]), input:not([disabled]), select:not([disabled])");
    await focusable.last().focus();
    await page.keyboard.press("Tab");
    await expect(dialog).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("saved v2 and application v3 state survive an apply URL change @desktop", async ({ page }) => {
    const job = firstJob(page);
    const trackingKey = await job.getAttribute("data-tracking-key");
    expect(trackingKey, "Job rows must expose their immutable tracking key").toMatch(/\S+/);

    const listingHref = await job.getByRole("link", { name: /open listing/i }).first().getAttribute("href");
    expect(listingHref).toBeTruthy();

    await saveButton(job).click();
    await trackButton(job).click();
    await page.getByRole("menuitemradio", { name: "Applied", exact: true }).click();

    const snapshot = await storageSnapshot(page);
    expect(Object.keys(snapshot)).toContain("timley:saved:v2");
    expect(Object.keys(snapshot)).toContain("timley:applications:v3");
    expect(Object.keys(snapshot)).not.toContain("timley:saved");
    expect(Object.keys(snapshot)).not.toContain("timley:applications:v2");
    expect(Object.keys(snapshot)).not.toContain("timley:applied");

    const savedStore = JSON.parse(snapshot["timley:saved:v2"]!) as {
      version?: unknown;
      records?: Record<string, { saved?: unknown }>;
    };
    const applicationStore = JSON.parse(snapshot["timley:applications:v3"]!) as {
      version?: unknown;
      records?: Record<string, { stage?: unknown }>;
    };
    expect(savedStore.version).toBe(2);
    expect(savedStore.records?.[trackingKey!]?.saved).toBe(true);
    expect(applicationStore.version).toBe(3);
    expect(applicationStore.records?.[trackingKey!]?.stage).toBe("applied");
    expect(snapshot["timley:saved:v2"]).not.toContain(listingHref!);
    expect(snapshot["timley:applications:v3"]).not.toContain(listingHref!);

    const movedListingHref = `https://example.com/jobs/moved-${trackingKey}`;
    await page.route("**/api/jobs", async (route) => {
      const requestBody = jobsRequestBody(route.request());
      if (requestBody.cursor !== null) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const payload = await response.json() as {
        items?: Array<Record<string, unknown>>;
      };
      payload.items = (payload.items ?? []).map((item) =>
        item.tracking_key === trackingKey
          ? { ...item, link: movedListingHref }
          : item,
      );
      await route.fulfill({ response, json: payload });
    });

    await openBoard(page);
    const restored = page.locator(`[data-testid="job-row"][data-tracking-key="${trackingKey}"]`);
    await expect(restored).toBeVisible();
    const restoredHref = await restored
      .getByRole("link", { name: /open listing/i })
      .first()
      .getAttribute("href");
    expect(restoredHref).toBe(movedListingHref);
    expect(restoredHref).not.toBe(listingHref);
    await expect(saveButton(restored)).toHaveAttribute("aria-pressed", "true");
    await expect(trackButton(restored)).toHaveAccessibleName(/Applied application stage/i);
  });
});

test("stored view state never visibly flashes the default @desktop", async ({ context, page }, testInfo) => {
  await context.addInitScript(() => {
    localStorage.setItem("timley:view", "table");
    const states: string[] = [];
    Object.defineProperty(window, "__timleyVisibleViewStates", { value: states });

    const recordVisibleState = () => {
      if (document.readyState === "loading" || document.styleSheets.length === 0) return;
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Table view"]');
      if (!button) return;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0
      ) {
        states.push(button.getAttribute("aria-pressed") ?? "missing");
      }
    };

    new MutationObserver(recordVisibleState).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "class", "style"],
    });
    document.addEventListener("DOMContentLoaded", recordVisibleState);
  });

  await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
  await openBoard(page);
  const tableView = page.getByRole("button", { name: "Table view" });
  await expect(tableView).toHaveAttribute("aria-pressed", "true");

  const visibleStates = await page.evaluate(
    () => (window as Window & { __timleyVisibleViewStates?: string[] }).__timleyVisibleViewStates ?? [],
  );
  expect(visibleStates.length, "The stored view should become visibly observable").toBeGreaterThan(0);
  expect(visibleStates, "Users must never see the default card state before stored table state").not.toContain("false");
});

test("stored filters never visibly flash their default controls @desktop", async ({ context, page }, testInfo) => {
  await context.addInitScript(() => {
    localStorage.setItem("timley:filters:v1", JSON.stringify({ remoteOnly: true }));
    const states: string[] = [];
    Object.defineProperty(window, "__timleyVisibleFilterStates", { value: states });

    const recordVisibleState = () => {
      if (document.readyState === "loading" || document.styleSheets.length === 0) return;
      const switches = document.querySelectorAll<HTMLButtonElement>(
        'button[role="switch"]',
      );
      const button = [...switches].find((candidate) =>
        candidate.textContent?.includes("Remote Only") &&
        candidate.getClientRects().length > 0,
      );
      if (!button) return;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0
      ) {
        states.push(button.getAttribute("aria-checked") ?? "missing");
      }
    };

    new MutationObserver(recordVisibleState).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-checked", "class", "style", "data-filters-ready"],
    });
    document.addEventListener("DOMContentLoaded", recordVisibleState);
  });

  await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
  await openBoard(page);
  const remoteOnly = page.getByRole("switch", { name: /Remote Only/i }).last();
  await expect(remoteOnly).toHaveAttribute("aria-checked", "true");

  const visibleStates = await page.evaluate(
    () => (window as Window & { __timleyVisibleFilterStates?: string[] }).__timleyVisibleFilterStates ?? [],
  );
  expect(visibleStates.length, "The stored filter should become visibly observable").toBeGreaterThan(0);
  expect(visibleStates, "Users must never see the default filter state before stored state").not.toContain("false");
});
