import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesheet = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const landingHero = readFileSync(
  new URL("../components/landing/LandingHero.tsx", import.meta.url),
  "utf8",
);
const jobsPage = readFileSync(
  new URL("../app/jobs/page.tsx", import.meta.url),
  "utf8",
);
const jobCard = readFileSync(
  new URL("../components/JobCard.tsx", import.meta.url),
  "utf8",
);

function tokensFor(scope: "app" | "marketing"): Record<string, string> {
  const expression = new RegExp(
    `--token-${scope}-color-([a-z-]+):\\s*(#[0-9a-f]{6});`,
    "gi",
  );
  return Object.fromEntries(
    [...stylesheet.matchAll(expression)].map(([, name, value]) => [name, value]),
  );
}

const appTokens = tokensFor("app");
const marketingTokens = tokensFor("marketing");

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => channel(Number.parseInt(value, 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function requireToken(
  tokens: Record<string, string>,
  scope: string,
  name: string,
): string {
  const value = tokens[name];
  assert.ok(value, `Missing --token-${scope}-color-${name}`);
  return value;
}

function assertContrast(
  tokens: Record<string, string>,
  scope: string,
  foreground: string,
  background: string,
  minimum: number,
): void {
  assert.ok(
    contrast(
      requireToken(tokens, scope, foreground),
      requireToken(tokens, scope, background),
    ) >= minimum,
    `${scope} ${foreground} must remain visible on ${background}`,
  );
}

test("application and marketing core text meet WCAG AA", () => {
  for (const [scope, tokens] of [
    ["app", appTokens],
    ["marketing", marketingTokens],
  ] as const) {
    for (const foreground of ["text", "text-muted", "text-secondary"]) {
      for (const background of ["page", "surface", "surface-muted"]) {
        assertContrast(tokens, scope, foreground, background, 4.5);
      }
    }
  }
});

test("actions, focus rings, and control boundaries remain visible in both themes", () => {
  for (const [scope, tokens] of [
    ["app", appTokens],
    ["marketing", marketingTokens],
  ] as const) {
    assertContrast(tokens, scope, "on-primary", "primary", 4.5);
    assertContrast(tokens, scope, "on-primary", "primary-hover", 4.5);

    for (const background of ["page", "surface", "surface-muted"]) {
      assertContrast(tokens, scope, "focus", background, 3);
      assertContrast(tokens, scope, "border-strong", background, 3);
    }
  }

  assertContrast(appTokens, "app", "primary", "primary-soft", 3);
  assert.match(
    stylesheet,
    /\.ui-tab\[aria-selected="true"\]::after,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*scaleX\(1\);/,
    "segmented tabs must render the animated full-contrast selected marker",
  );
  assert.match(
    stylesheet,
    /\.ui-selected\s*\{[\s\S]*?border-color:\s*var\(--accent\);[\s\S]*?\}/,
    "selected controls must keep a full-contrast boundary",
  );
});

test("application semantic colors remain readable on base and soft surfaces", () => {
  const semanticColors = [
    "primary",
    "primary-hover",
    "success",
    "warning",
    "error",
    "info",
  ];
  for (const foreground of semanticColors) {
    for (const background of ["page", "surface", "surface-muted"]) {
      assertContrast(appTokens, "app", foreground, background, 4.5);
    }
  }

  for (const [foreground, background] of [
    ["primary", "primary-soft"],
    ["success", "success-soft"],
    ["warning", "warning-soft"],
    ["error", "error-soft"],
    ["info", "info-soft"],
  ]) {
    assertContrast(appTokens, "app", foreground, background, 4.5);
  }

  for (const foreground of [
    "primary-display",
    "success",
    "warning",
    "error",
    "info",
  ]) {
    for (const background of ["page", "surface", "surface-muted"]) {
      assertContrast(marketingTokens, "marketing", foreground, background, 4.5);
    }
  }
});

test("category badge pairs remain non-semantic and WCAG AA", () => {
  const categorySection = stylesheet.slice(
    stylesheet.indexOf("/* Category badges"),
  );
  const pairs = [
    ...categorySection.matchAll(
      /background:\s*(#[0-9a-f]{6});\s*\n\s*color:\s*(#[0-9a-f]{6});/gi,
    ),
  ];
  assert.equal(pairs.length, 10, "Expected every category color group");
  for (const [, background, foreground] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} must remain readable on ${background}`,
    );
  }
});

test("two visual surfaces and the signature Apply action stay wired", () => {
  assert.match(landingHero, /theme-marketing/);
  assert.match(jobsPage, /theme-application/);
  assert.match(
    stylesheet,
    /\.theme-application\s*\{[\s\S]*?--bg:\s*var\(--token-app-color-page\);/,
    "nested light product previews must reset application aliases",
  );
  assert.match(jobCard, /ui-button--apply/);
  for (const creamColor of ["#f5f0e6", "#fffdf8", "#ece6da"]) {
    assert.doesNotMatch(stylesheet.toLowerCase(), new RegExp(creamColor));
  }
});

test("reusable motion contracts use tokens and transform-safe keyframes", () => {
  for (const token of [
    "--motion-duration-fast",
    "--motion-duration-standard",
    "--motion-duration-panel",
    "--motion-duration-marketing",
    "--motion-duration-progress",
    "--motion-duration-marquee",
    "--motion-duration-demo",
    "--motion-ease-standard",
    "--motion-ease-emphasized",
  ]) {
    assert.match(stylesheet, new RegExp(`${token}:`), `Missing ${token}`);
  }

  for (const contract of [
    "motion-section-reveal",
    "motion-product-card",
    "motion-value-update",
    "motion-marquee-track",
    "motion-filter-panel",
    "motion-drawer",
    "motion-toast",
    "motion-stage-transition",
    "landing-company-marquee__track",
    "landing-reveal",
  ]) {
    assert.match(stylesheet, new RegExp(`\\.${contract}\\b`), `Missing ${contract}`);
  }

  const primitiveSection = stylesheet.slice(
    stylesheet.indexOf("/* Shared visual primitives"),
    stylesheet.indexOf("@media (prefers-reduced-motion"),
  );
  assert.doesNotMatch(
    primitiveSection,
    /\b\d+(?:\.\d+)?m?s\b/,
    "Shared primitives and motion patterns must consume duration tokens",
  );
  assert.match(primitiveSection, /animation:\s*ui-spin var\(--motion-duration-progress\)/);

  const motionKeyframes = primitiveSection.slice(
    primitiveSection.indexOf("@keyframes motion-reveal"),
    primitiveSection.indexOf("@keyframes ui-spin"),
  );
  assert.doesNotMatch(
    motionKeyframes,
    /\b(?:top|right|bottom|left|width|height|margin|padding):/,
    "Motion keyframes must not animate layout properties",
  );
  assert.match(
    stylesheet,
    /\.marketing-source-marquee:is\(:hover, :focus-within\)[\s\S]*?animation-play-state:\s*paused;/,
  );
  assert.match(
    stylesheet,
    /\.landing-company-marquee:is\(:hover, :focus-within\)[\s\S]*?animation-play-state:\s*paused;/,
  );
});

test("reduced motion disables movement and keeps marquee content available", () => {
  const reducedMotion = stylesheet.slice(
    stylesheet.indexOf("@media (prefers-reduced-motion: reduce)"),
    stylesheet.indexOf("/* Category badges"),
  );
  assert.match(reducedMotion, /html\s*\{[\s\S]*?scroll-behavior:\s*auto;/);
  assert.match(reducedMotion, /\*,\s*\n\s*\*::before,\s*\n\s*\*::after\s*\{/);
  assert.match(reducedMotion, /animation-duration:\s*0\.01ms\s*!important;/);
  assert.match(reducedMotion, /animation-iteration-count:\s*1\s*!important;/);
  assert.match(reducedMotion, /transition-duration:\s*0\.01ms\s*!important;/);
  assert.match(reducedMotion, /\.motion-marquee-track[\s\S]*?animation:\s*none\s*!important;/);
  assert.match(
    reducedMotion,
    /\.motion-marquee-copy\[aria-hidden="true"\][\s\S]*?display:\s*none;/,
  );
  assert.match(
    reducedMotion,
    /\.landing-company-marquee__copy\[aria-hidden="true"\][\s\S]*?display:\s*none;/,
  );
  assert.match(
    reducedMotion,
    /\.landing-demo-job,[\s\S]*?animation:\s*none\s*!important;/,
  );
});
