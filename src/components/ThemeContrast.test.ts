import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => channel(Number.parseInt(value, 16)));
  assert.ok(channels && channels.length === 3);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("filled action blue passes white-text contrast without changing accent blue", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const accent = css.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1];
  const action = css.match(/--action:\s*(#[0-9a-f]{6})/i)?.[1];

  assert.equal(accent?.toLowerCase(), "#0a84ff");
  assert.ok(action);
  assert.ok(contrast(action, "#ffffff") >= 4.5);
});
