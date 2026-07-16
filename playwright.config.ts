import { defineConfig, type Project } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

function requireLoopbackURL(label: string, value: string | undefined): URL {
  if (!value) {
    throw new Error(`${label} must be set to the local test stack before Playwright runs`);
  }
  const url = new URL(value);
  if (
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "::1" &&
    url.hostname !== "[::1]"
  ) {
    throw new Error(`${label} must use a loopback host; refusing to run browser tests against ${url.host}`);
  }
  return url;
}

requireLoopbackURL("PLAYWRIGHT_BASE_URL", baseURL);
requireLoopbackURL(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
if (process.env.SUPABASE_URL) {
  requireLoopbackURL("SUPABASE_URL", process.env.SUPABASE_URL);
}

const viewportProjects: Project[] = [
  {
    name: "phone-portrait",
    grep: /@all|@phone-desktop/,
    use: { viewport: { width: 390, height: 844 }, hasTouch: true },
  },
  {
    name: "phone-landscape",
    grep: /@all|@phone-landscape/,
    use: { viewport: { width: 844, height: 390 }, hasTouch: true },
  },
  {
    name: "tablet-portrait",
    grep: /@all/,
    use: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  },
  {
    name: "tablet-landscape",
    grep: /@all/,
    use: { viewport: { width: 1024, height: 768 }, hasTouch: true },
  },
  {
    name: "desktop",
    grep: /@all|@desktop|@phone-desktop/,
    use: { viewport: { width: 1440, height: 900 } },
  },
];

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: isCI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    browserName: "chromium",
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "America/Denver",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: viewportProjects,
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
