import { expect, test } from "@playwright/test";
import {
  applyLink,
  attachViewportScreenshot,
  expectInsideViewport,
  expectNoHorizontalOverflow,
  firstJob,
  openBoard,
  projectBaseURL,
  stubExternalBrowserRequests,
  trackButton,
} from "./support";

test.beforeEach(async ({ context, page }, testInfo) => {
  await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
  await openBoard(page);
});

test("renders usable actions without overflow at the required viewport @all", async ({ page }, testInfo) => {
  const job = firstJob(page);
  const apply = applyLink(job);

  await expect(page.getByTestId("job-toolbar")).toBeVisible();
  await expect(job).toBeVisible();
  await expect(apply, "Apply must remain visible in every card breakpoint").toBeVisible();

  await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>("[data-sticky-toolbar]");
    if (toolbar) window.scrollTo({ top: toolbar.offsetTop + 1, behavior: "auto" });
  });
  const toolbarBox = await page.getByTestId("job-toolbar").boundingBox();
  const jobBox = await job.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(jobBox).not.toBeNull();
  if (toolbarBox && jobBox) {
    expect(
      jobBox.y,
      "The sticky toolbar must not cover the first job card at its resting position",
    ).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 1);
  }

  const href = await apply.getAttribute("href");
  expect(href, "Apply should have a destination").toBeTruthy();
  expect(new URL(href!, page.url()).protocol).toBe("https:");

  const viewport = page.viewportSize();
  const applyBox = await apply.boundingBox();
  if (viewport && viewport.width <= 1024) {
    expect(applyBox?.width ?? 0, "Apply needs a 44px touch target on phone/tablet").toBeGreaterThanOrEqual(44);
    expect(applyBox?.height ?? 0, "Apply needs a 44px touch target on phone/tablet").toBeGreaterThanOrEqual(44);
  }

  await expectNoHorizontalOverflow(page);
  await attachViewportScreenshot(page, testInfo, "board");
});

test("200% zoom equivalent reflows without page-level horizontal scrolling @desktop", async ({ page }, testInfo) => {
  // A 1440x900 viewport at 200% browser zoom exposes roughly a 720x450 CSS viewport.
  // This exercises responsive reflow; deviceScaleFactor alone would only change pixel density.
  await page.setViewportSize({ width: 720, height: 450 });
  await expect(page.getByTestId("job-toolbar")).toBeVisible();
  await expect(applyLink(firstJob(page))).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await attachViewportScreenshot(page, testInfo, "200-percent-reflow");
});

test("Track stays opaque, viewport-safe, and above the sticky toolbar in short landscape @phone-landscape", async ({ page }, testInfo) => {
  const trigger = trackButton(firstJob(page));
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const menu = page.getByRole("menu", { name: /application stage for/i });
  await expect(menu).toBeVisible();
  await expectInsideViewport(menu, page, 8);

  const stacking = await page.evaluate(() => {
    const menuElement = document.querySelector<HTMLElement>('[role="menu"][aria-label^="Application stage"]');
    const toolbar = document.querySelector<HTMLElement>("[data-sticky-toolbar]");
    if (!menuElement || !toolbar) return null;
    return {
      menu: Number.parseInt(getComputedStyle(menuElement).zIndex || "0", 10),
      toolbar: Number.parseInt(getComputedStyle(toolbar).zIndex || "0", 10),
      background: getComputedStyle(menuElement).backgroundColor,
      backgroundAlpha: (() => {
        const color = getComputedStyle(menuElement).backgroundColor;
        const match = color.match(/rgba?\(([^)]+)\)/);
        const channels = match?.[1].split(",").map((channel) => channel.trim()) ?? [];
        return channels.length === 4 ? Number.parseFloat(channels[3]) : 1;
      })(),
    };
  });

  expect(stacking).not.toBeNull();
  expect(stacking!.menu, "Track must stack above the sticky toolbar").toBeGreaterThan(stacking!.toolbar);
  expect(stacking!.background, "Track needs an explicit background color").not.toBe("rgba(0, 0, 0, 0)");
  expect(stacking!.backgroundAlpha, "Track needs a fully opaque background").toBe(1);
  await attachViewportScreenshot(page, testInfo, "track-short-landscape");
});
