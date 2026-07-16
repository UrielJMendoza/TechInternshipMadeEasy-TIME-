import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMenuFocusIndex,
  calculateMenuPosition,
  menuOptionIndexForStage,
} from "./ApplicationStageMenu";

test("stage menu uses the selected radio item as its initial focus target", () => {
  assert.equal(menuOptionIndexForStage("not_applied"), 0);
  assert.equal(menuOptionIndexForStage("interview"), 3);
  assert.equal(menuOptionIndexForStage("offer"), 5);
});

test("stage menu focus navigation wraps and falls back to the selected item", () => {
  assert.equal(calculateMenuFocusIndex(-1, 3, "next"), 4);
  assert.equal(calculateMenuFocusIndex(-1, 3, "previous"), 2);
  assert.equal(calculateMenuFocusIndex(5, 3, "next"), 0);
  assert.equal(calculateMenuFocusIndex(0, 3, "previous"), 5);
  assert.equal(calculateMenuFocusIndex(3, 3, "first"), 0);
  assert.equal(calculateMenuFocusIndex(3, 3, "last"), 5);
});

test("stage menu flips above and stays below the sticky toolbar in a short viewport", () => {
  const position = calculateMenuPosition(
    { left: 250, right: 294, top: 330, bottom: 374 },
    { width: 208, height: 320 },
    { left: 0, right: 390, top: 0, bottom: 390 },
    150,
  );

  assert.equal(position.placement, "above");
  assert.equal(position.top, 157);
  assert.equal(position.maxHeight, 166);
  assert.ok(position.left >= 8);
  assert.ok(position.left + 208 <= 382);
});

test("stage menu uses the visual viewport offsets and opens below when it fits", () => {
  const position = calculateMenuPosition(
    { left: 330, right: 395, top: 200, bottom: 244 },
    { width: 208, height: 320 },
    { left: 10, right: 400, top: 20, bottom: 844 },
    120,
  );

  assert.equal(position.placement, "below");
  assert.equal(position.top, 251);
  assert.equal(position.left, 184);
  assert.equal(position.maxHeight, 320);
});

test("stage menu narrows to a zoomed visual viewport without horizontal escape", () => {
  const position = calculateMenuPosition(
    { left: 130, right: 175, top: 160, bottom: 204 },
    { width: 208, height: 240 },
    { left: 30, right: 180, top: 40, bottom: 500 },
  );

  assert.equal(position.maxWidth, 134);
  assert.equal(position.left, 38);
  assert.ok(position.left + position.maxWidth <= 172);
});
