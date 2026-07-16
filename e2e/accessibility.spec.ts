import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  firstJob,
  openBoard,
  projectBaseURL,
  stubExternalBrowserRequests,
  trackButton,
} from "./support";

async function expectNoBlockingAxeViolations(
  page: Page,
  testInfo: TestInfo,
  state: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  await testInfo.attach(`${testInfo.project.name}-${state}-axe.json`, {
    body: JSON.stringify({ violations: blocking }, null, 2),
    contentType: "application/json",
  });

  expect(
    blocking,
    blocking
      .map((violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(" ")}`)
          .join("\n")}`,
      )
      .join("\n\n"),
  ).toEqual([]);
}

test.beforeEach(async ({ context, page }, testInfo) => {
  await stubExternalBrowserRequests(context, projectBaseURL(testInfo));
  await openBoard(page);
});

test("has no serious or critical axe violations in the default board @all", async ({ page }, testInfo) => {
  await expectNoBlockingAxeViolations(page, testInfo, "default");
});

test("has no serious or critical axe violations in interactive overlays @all", async ({ page }, testInfo) => {
  const trigger = trackButton(firstJob(page));
  await trigger.click();
  await expect(page.getByRole("menu", { name: /application stage for/i })).toBeVisible();
  await expectNoBlockingAxeViolations(page, testInfo, "track-menu");
  await page.keyboard.press("Escape");

  const viewport = page.viewportSize();
  if ((viewport?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: /^Filters(?:\s+\d+)?$/ }).click();
    await expect(page.getByRole("dialog", { name: "Filters and sorting" })).toBeVisible();
    await expectNoBlockingAxeViolations(page, testInfo, "mobile-filter-sheet");
  } else {
    await page.getByRole("button", { name: "Locations", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Locations" })).toBeVisible();
    await expectNoBlockingAxeViolations(page, testInfo, "desktop-filter-popover");
  }
});
